import { Router } from 'express';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { ShareClientPortal } from '../application/share-client-portal.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
type OwnerHandler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { workspace: { id: string } } }
>;
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid portal request');
  return result.data;
}
export function createPortalRouter(portal: ShareClientPortal) {
  const router = Router({ mergeParams: true });
  const read: OwnerHandler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    response.json({
      success: true,
      data: await portal.read(
        response.locals.identity.workspace.id,
        request.params.clientId ?? '',
      ),
    });
  };
  const issue: OwnerHandler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    const body = parse(
      z.strictObject({ version: z.number(), days: z.number() }),
      request.body,
    );
    response.status(201).json({
      success: true,
      data: await portal.issue(
        response.locals.identity.workspace.id,
        request.params.clientId ?? '',
        body.version,
        body.days,
      ),
    });
  };
  const revoke: OwnerHandler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    const body = parse(z.strictObject({ version: z.number() }), request.body);
    response.json({
      success: true,
      data: await portal.revoke(
        response.locals.identity.workspace.id,
        request.params.clientId ?? '',
        body.version,
      ),
    });
  };
  const preview: OwnerHandler = async (request, response) => {
    const cursors = parse(
      z.strictObject({
        projects: z.string().optional(),
        invoices: z.string().optional(),
      }),
      request.query,
    );
    response.json({
      success: true,
      data: await portal.preview(
        response.locals.identity.workspace.id,
        request.params.clientId ?? '',
        {
          projects: cursors.projects ?? null,
          invoices: cursors.invoices ?? null,
        },
      ),
    });
  };
  router.route('/').get(read).post(issue);
  router.post('/revoke', revoke);
  router.get('/preview', preview);
  return router;
}
export function createPublicPortalRouter(portal: ShareClientPortal) {
  const router = Router();
  router.post(
    '/read',
    rateLimit({
      windowMs: 60000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      },
    }),
    async (request, response) => {
      const body = z
        .strictObject({
          token: z.string().max(100),
          projects: z.string().max(100).nullable().optional(),
          invoices: z.string().max(100).nullable().optional(),
        })
        .safeParse(request.body as unknown);
      if (!body.success || !z.strictObject({}).safeParse(request.query).success)
        throw new ApplicationError(
          'PORTAL_SHARE_UNAVAILABLE',
          'Portal unavailable',
        );
      response.json({
        success: true,
        data: await portal.readPublic(body.data.token, {
          projects: body.data.projects ?? null,
          invoices: body.data.invoices ?? null,
        }),
      });
    },
  );
  return router;
}
