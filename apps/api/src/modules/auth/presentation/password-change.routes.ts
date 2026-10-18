import { Router } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ChangePassword } from '../application/change-password.js';
import type { SessionEndpoints } from './session.routes.js';
import { clearRefreshCookie } from './refresh-cookie.js';
import { unauthenticated } from '../domain/session.js';
const schema = z.strictObject({
  currentPassword: z.string().max(256),
  newPassword: z.string().max(256),
});
export function createPasswordChangeRouter(
  service: ChangePassword,
  sessions: SessionEndpoints,
  origin: string,
) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  router.post('/', async (request, response) => {
    if (request.get('origin') !== origin)
      throw new ApplicationError(
        'UNTRUSTED_ORIGIN',
        'Request origin is not allowed',
      );
    const authorization = request.get('authorization');
    const token =
      authorization && authorization.length <= 4096
        ? /^Bearer ([^\s]+)$/iu.exec(authorization)?.[1]
        : null;
    if (!token) throw unauthenticated();
    const { claims } = await sessions.authenticate.context(token);
    const parsed = schema.safeParse(request.body as unknown);
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid password change');
    await service.execute(claims, parsed.data);
    clearRefreshCookie(response, sessions.secureCookies);
    response.status(204).end();
  });
  return router;
}
