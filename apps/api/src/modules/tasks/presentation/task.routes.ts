import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ManageTasks } from '../application/manage-tasks.js';
type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { workspace: { id: string } } }
>;
const version = z.number();
const content = {
  version,
  title: z.string(),
  description: z.string().optional().default(''),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
};
const details = z.strictObject(content);
const move = z.strictObject({
  version,
  status: z.enum(['todo', 'in_progress', 'done']),
  beforeTaskId: z.string().nullable(),
});
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid task request fields',
    );
  return result.data;
}
export function createTaskRouter(tasks: ManageTasks) {
  const router = Router({ mergeParams: true });
  router.use((req, _res, next) => {
    parse(z.strictObject({}), req.query);
    next();
  });
  const read: Handler = async (req, res) => {
    res.json({
      success: true,
      data: await tasks.read(
        res.locals.identity.workspace.id,
        req.params.projectId ?? '',
      ),
    });
  };
  const create: Handler = async (req, res) => {
    const { version, ...input } = parse(details, req.body);
    res.status(201).json({
      success: true,
      data: await tasks.create(
        res.locals.identity.workspace.id,
        req.params.projectId ?? '',
        version,
        input,
      ),
    });
  };
  const edit: Handler = async (req, res) => {
    const { version, ...input } = parse(details, req.body);
    res.json({
      success: true,
      data: await tasks.update(
        res.locals.identity.workspace.id,
        req.params.projectId ?? '',
        req.params.taskId ?? '',
        version,
        input,
      ),
    });
  };
  const relocate: Handler = async (req, res) => {
    const input = parse(move, req.body);
    res.json({
      success: true,
      data: await tasks.move(
        res.locals.identity.workspace.id,
        req.params.projectId ?? '',
        req.params.taskId ?? '',
        input.version,
        input.status,
        input.beforeTaskId,
      ),
    });
  };
  const remove: Handler = async (req, res) => {
    const input = parse(z.strictObject({ version }), req.body);
    res.json({
      success: true,
      data: await tasks.remove(
        res.locals.identity.workspace.id,
        req.params.projectId ?? '',
        req.params.taskId ?? '',
        input.version,
      ),
    });
  };
  const visibility: Handler = async (req, res) => {
    const input = parse(
      z.strictObject({ version, clientVisible: z.boolean() }),
      req.body,
    );
    res.json({
      success: true,
      data: await tasks.setClientVisibility(
        res.locals.identity.workspace.id,
        req.params.projectId ?? '',
        req.params.taskId ?? '',
        input.version,
        input.clientVisible,
      ),
    });
  };
  router.route('/').get(read).post(create);
  router.route('/:taskId').put(edit).delete(remove);
  router.post('/:taskId/move', relocate);
  router.post('/:taskId/visibility', visibility);
  return router;
}
