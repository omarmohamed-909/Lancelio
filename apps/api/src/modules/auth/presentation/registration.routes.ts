import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { RegisterAndSignIn } from '../application/register-and-sign-in.js';
import { setRefreshCookie } from './refresh-cookie.js';

const requestSchema = z.strictObject({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  workspaceName: z.string().optional(),
});

export function createRegistrationRouter(
  registerAccount: RegisterAndSignIn,
  webOrigin: string,
  secureCookies: boolean,
) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/register',
    (request, _response, next) => {
      if (request.get('origin') !== webOrigin)
        throw new ApplicationError(
          'UNTRUSTED_ORIGIN',
          'Request origin is not allowed',
        );
      next();
    },
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many registration attempts. Try again later.',
        },
      },
    }),
    async (request, response) => {
      const parsed = requestSchema.safeParse(request.body as unknown);
      if (!parsed.success) {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Invalid registration data',
        );
      }
      const input = {
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        ...(parsed.data.workspaceName !== undefined
          ? { workspaceName: parsed.data.workspaceName }
          : {}),
      };
      const account = await registerAccount.execute(input);
      response.setHeader('Cache-Control', 'no-store');
      setRefreshCookie(
        response,
        secureCookies,
        account.refreshToken,
        account.refreshExpiresAt,
      );
      response.status(201).json({
        success: true,
        data: {
          ...account.identity,
          accessToken: account.accessToken,
          expiresIn: account.expiresIn,
          tokenType: 'Bearer',
        },
      });
    },
  );
  return router;
}
