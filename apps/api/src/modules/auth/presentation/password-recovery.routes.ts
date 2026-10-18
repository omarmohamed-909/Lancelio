import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { PasswordRecovery } from '../application/password-recovery.js';
export function createRecoveryRouter(
  recovery: PasswordRecovery,
  webOrigin: string,
) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  const limiter = () =>
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many recovery attempts. Try again later.',
        },
      },
    });
  const requestSchema = z.strictObject({ email: z.string().max(254) });
  const resetSchema = z.strictObject({
    token: z.string().max(100),
    password: z.string().max(512),
  });
  router.use(
    ['/forgot-password', '/reset-password'],
    (request, _response, next) => {
      if (request.get('origin') !== webOrigin)
        throw new ApplicationError(
          'UNTRUSTED_ORIGIN',
          'Request origin is not allowed',
        );
      next();
    },
  );
  router.post('/forgot-password', limiter(), async (request, response) => {
    const parsed = requestSchema.safeParse(request.body as unknown);
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid recovery data');
    await recovery.request(parsed.data.email);
    response.status(202).json({ success: true, data: { accepted: true } });
  });
  router.post('/reset-password', limiter(), async (request, response) => {
    const parsed = resetSchema.safeParse(request.body as unknown);
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid recovery data');
    await recovery.reset(parsed.data.token, parsed.data.password);
    response.status(204).end();
  });
  return router;
}
