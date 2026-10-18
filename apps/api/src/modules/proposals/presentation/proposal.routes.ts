import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ManageProposals } from '../application/manage-proposals.js';
type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { workspace: { id: string } } }
>;
const fields = {
  clientId: z.string(),
  title: z.string(),
  summary: z.string().optional().default(''),
  terms: z.string().optional().default(''),
  currency: z.string(),
  items: z
    .array(
      z.strictObject({
        title: z.string(),
        quantity: z.number(),
        unitPrice: z.string(),
      }),
    )
    .max(50),
};
const createSchema = z.strictObject(fields);
const updateSchema = z.strictObject({ ...fields, version: z.number() });
const querySchema = z.strictObject({
  cursor: z.string().optional(),
  order: z.enum(['newest', 'oldest']).optional(),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid proposal request');
  return result.data;
}
export function createProposalRouter(proposals: ManageProposals) {
  const router = Router();
  const create: Handler = async (request, response) => {
    response.status(201).json({
      success: true,
      data: await proposals.create(
        response.locals.identity.workspace.id,
        parse(createSchema, request.body),
      ),
    });
  };
  const list: Handler = async (request, response) => {
    const query = parse(querySchema, request.query);
    response.json({
      success: true,
      data: await proposals.list(
        response.locals.identity.workspace.id,
        query.cursor,
        query.order,
      ),
    });
  };
  const read: Handler = async (request, response) => {
    response.json({
      success: true,
      data: await proposals.read(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
      ),
    });
  };
  const update: Handler = async (request, response) => {
    const input = parse(updateSchema, request.body);
    response.json({
      success: true,
      data: await proposals.update(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
        input.version,
        input,
      ),
    });
  };
  router.route('/').get(list).post(create);
  router.route('/:id').get(read).put(update);
  return router;
}
