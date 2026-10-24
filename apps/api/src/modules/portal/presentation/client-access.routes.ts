import { Router } from 'express';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { ManageClientAccess } from '../application/manage-client-access.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  {
    identity: {
      user: { id: string };
      workspace: { id: string };
      membership: { role: string };
    };
  }
>;
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid invitation request',
    );
  return parsed.data;
}
const revision = z.strictObject({ version: z.number().int().nonnegative() });
export function createClientAccessRouter(
  service: ManageClientAccess,
  origin: string,
) {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 90,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  router.use((request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.get('origin') !== origin)
      throw new ApplicationError(
        'UNTRUSTED_ORIGIN',
        'Request origin is not allowed',
      );
    if (request.path !== '/list' && request.path !== '/portal')
      parse(z.strictObject({}), request.query);
    next();
  });
  const ownerIdentity = (identity: {
    user: { id: string };
    workspace: { id: string };
    membership: { role: string };
  }) => ({
    userId: identity.user.id,
    workspaceId: identity.workspace.id,
    role: identity.membership.role,
  });
  const owner: Handler = async (req, res) => {
    res.json({
      success: true,
      data: await service.readOwner(
        ownerIdentity(res.locals.identity),
        req.params.clientId ?? '',
      ),
    });
  };
  const issue: Handler = async (req, res) => {
    const body = parse(
      revision.extend({
        locale: z.enum(['ar', 'en']),
        email: z.email().max(254),
      }),
      req.body,
    );
    res.status(201).json({
      success: true,
      data: await service.issue(
        ownerIdentity(res.locals.identity),
        req.params.clientId ?? '',
        body.version,
        body.locale,
        body.email,
      ),
    });
  };
  const revoke: Handler = async (req, res) => {
    const body = parse(revision, req.body);
    await service.revoke(
      ownerIdentity(res.locals.identity),
      req.params.clientId ?? '',
      body.version,
    );
    res.sendStatus(204);
  };
  const list: Handler = async (req, res) => {
    const query = parse(
      z.strictObject({ after: z.string().optional() }),
      req.query,
    );
    res.json({
      success: true,
      data: await service.list(
        res.locals.identity.user.id,
        query.after ?? null,
      ),
    });
  };
  const resolve: Handler = async (req, res) => {
    const body = parse(
      z.strictObject({ token: z.string().max(100) }),
      req.body,
    );
    res.json({
      success: true,
      data: await service.resolve(res.locals.identity.user.id, body.token),
    });
  };
  const decide: Handler = async (req, res) => {
    const body = parse(
      revision.extend({
        accept: z.boolean(),
        token: z.string().max(100).nullable(),
      }),
      req.body,
    );
    await service.decide(
      res.locals.identity.user.id,
      req.params.id ?? '',
      body.version,
      body.accept,
      body.token,
    );
    res.sendStatus(204);
  };
  const leave: Handler = async (req, res) => {
    const body = parse(revision, req.body);
    await service.leave(
      res.locals.identity.user.id,
      req.params.id ?? '',
      body.version,
    );
    res.sendStatus(204);
  };
  const page: Handler = async (req, res) => {
    const body = parse(
      z.strictObject({
        projects: z.string().nullable(),
        invoices: z.string().nullable(),
      }),
      req.body,
    );
    res.json({
      success: true,
      data: await service.page(
        res.locals.identity.user.id,
        req.params.id ?? '',
        body,
      ),
    });
  };
  router.get('/owner/:clientId', owner);
  router.post(
    '/owner/:clientId',
    rateLimit({
      windowMs: 3600000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMITED' } },
    }),
    issue,
  );
  router.post('/owner/:clientId/revoke', revoke);
  router.get('/list', list);
  router.post('/resolve', resolve);
  router.post('/:id/decide', decide);
  router.post('/:id/leave', leave);
  router.post('/:id/portal', page);
  return router;
}
