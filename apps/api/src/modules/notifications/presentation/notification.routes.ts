import { Router } from 'express';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import type { ManageNotifications } from '../application/manage-notifications.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { user: { id: string }; workspace: { id: string } } }
>;
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid notification request',
    );
  return result.data;
}
export function createNotificationRouter(notifications: ManageNotifications) {
  const router = Router();
  const list: Handler = async (req, res) => {
    const query = parse(
      z.strictObject({
        filter: z.enum(['all', 'unread']).optional(),
        cursor: z.string().max(300).optional(),
      }),
      req.query,
    );
    const { workspace, user } = res.locals.identity;
    res.json({
      success: true,
      data: await notifications.list(
        workspace.id,
        user.id,
        query.filter === 'unread',
        query.cursor ?? null,
      ),
    });
  };
  const summary: Handler = async (req, res) => {
    parse(z.strictObject({}), req.query);
    const { workspace, user } = res.locals.identity;
    res.json({
      success: true,
      data: await notifications.summary(workspace.id, user.id),
    });
  };
  const read: Handler = async (req, res) => {
    parse(z.strictObject({}), req.query);
    const body = parse(
      z.strictObject({ read: z.boolean(), version: z.number() }),
      req.body,
    );
    const { workspace, user } = res.locals.identity;
    res.json({
      success: true,
      data: await notifications.setRead(
        workspace.id,
        user.id,
        req.params.id ?? '',
        body.version,
        body.read,
      ),
    });
  };
  router.get('/', list);
  router.get('/summary', summary);
  router.post('/:id/read', read);
  return router;
}
