import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ManageClients } from '../application/manage-clients.js';
type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { workspace: { id: string } } }
>;
const details = {
  name: z.string(),
  email: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  company: z.string().optional().default(''),
  notes: z.string().optional().default(''),
};
const createSchema = z.strictObject(details);
const updateSchema = z.strictObject({ ...details, version: z.number() });
const archiveSchema = z.strictObject({ version: z.number() });
const querySchema = z.strictObject({
  status: z.enum(['active', 'archived']).optional().default('active'),
  cursor: z.string().optional(),
  order: z.enum(['newest', 'oldest']).optional(),
  q: z.string().optional(),
  contact: z.enum(['all', 'email', 'phone', 'none']).optional(),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid request fields');
  return result.data;
}
export function createClientRouter(clients: ManageClients) {
  const router = Router();
  const create: Handler = async (request, response) => {
    const result = await clients.create(
      response.locals.identity.workspace.id,
      parse(createSchema, request.body),
    );
    response.status(201).json({ success: true, data: result });
  };
  const list: Handler = async (request, response) => {
    const query = parse(querySchema, request.query);
    response.json({
      success: true,
      data: await clients.list(response.locals.identity.workspace.id, {
        archived: query.status === 'archived',
        ...(query.order === undefined ? {} : { order: query.order }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.q === undefined ? {} : { search: query.q }),
        ...(query.contact === undefined ? {} : { contact: query.contact }),
      }),
    });
  };
  const read: Handler = async (request, response) => {
    response.json({
      success: true,
      data: await clients.read(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
      ),
    });
  };
  const update: Handler = async (request, response) => {
    const input = parse(updateSchema, request.body);
    response.json({
      success: true,
      data: await clients.update(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
        input.version,
        input,
      ),
    });
  };
  const archive: Handler = async (request, response) => {
    const input = parse(archiveSchema, request.body);
    response.json({
      success: true,
      data: await clients.archive(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
        input.version,
      ),
    });
  };
  router.route('/').get(list).post(create);
  router.route('/:id').get(read).put(update);
  router.post('/:id/archive', archive);
  return router;
}
