import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { RegisterAccount } from '../application/register-account.js';

const requestSchema = z.strictObject({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  workspaceName: z.string().optional(),
});

export function createRegistrationRouter(registerAccount: RegisterAccount) {
  const router = Router();
  router.post(
    '/register',
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
      response.status(201).json({ success: true, data: account });
    },
  );
  return router;
}
