import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ManageProjects } from '../application/manage-projects.js';
type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { workspace: { id: string } } }
>;
const status = z.enum(['active', 'on_hold', 'completed', 'cancelled']);
const manual = z.strictObject({
  clientId: z.string(),
  title: z.string(),
  summary: z.string().optional().default(''),
});
const query = z.strictObject({
  status: z
    .enum(['all', 'active', 'on_hold', 'completed', 'cancelled'])
    .optional(),
  cursor: z.string().optional(),
  order: z.enum(['newest', 'oldest']).optional(),
});
const change = z.strictObject({ status, version: z.number() });
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid request fields');
  return result.data;
}
export function createProjectRouter(projects: ManageProjects) {
  const router = Router();
  const read: Handler = async (request, response) => {
    response.json({
      success: true,
      data: await projects.read(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
      ),
    });
  };
  const list: Handler = async (request, response) => {
    response.json({
      success: true,
      data: await projects.list(
        response.locals.identity.workspace.id,
        parse(query, request.query),
      ),
    });
  };
  const create: Handler = async (request, response) => {
    response.status(201).json({
      success: true,
      data: await projects.create(
        response.locals.identity.workspace.id,
        parse(manual, request.body),
      ),
    });
  };
  const update: Handler = async (request, response) => {
    const input = parse(change, request.body);
    response.json({
      success: true,
      data: await projects.changeStatus(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
        input.version,
        input.status,
      ),
    });
  };
  router.route('/').get(list).post(create);
  router.get('/:id', read);
  router.post('/:id/status', update);
  return router;
}
