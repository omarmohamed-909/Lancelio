import { Router } from 'express';
import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { AuthenticateSession } from '../application/authenticate-session.js';
import type { Login } from '../application/login.js';
import type { RefreshSession } from '../application/refresh-session.js';
import type { Logout } from '../application/logout.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import { createAuthenticationMiddleware } from './authentication.middleware.js';
import type { AuthenticatedHandler } from './authentication.middleware.js';
import { normalizeEmail } from '../domain/credential-policy.js';

export interface SessionEndpoints {
  login: Login;
  authenticate: AuthenticateSession;
  refresh: RefreshSession;
  logout: Logout;
  secureCookies: boolean;
}

const loginSchema = z.strictObject({
  email: z.string(),
  password: z.string(),
  workspaceId: z.string().optional(),
});

export function createSessionRouter(
  services: SessionEndpoints,
  webOrigin: string,
) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  const trustedOrigin: RequestHandler = (request, _response, next) => {
    if (request.get('origin') !== webOrigin)
      throw new ApplicationError(
        'UNTRUSTED_ORIGIN',
        'Request origin is not allowed',
      );
    next();
  };
  const emptyBody: RequestHandler = (request, _response, next) => {
    const body: unknown = request.body;
    if (!z.strictObject({}).safeParse(body === undefined ? {} : body).success) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'This endpoint accepts no body fields',
      );
    }
    next();
  };
  router.post(
    '/login',
    trustedOrigin,
    rateLimit({
      identifier: 'login-network-failures',
      windowMs: 15 * 60 * 1000,
      limit: 60,
      skipSuccessfulRequests: true,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many failed login attempts. Try again later.',
        },
      },
    }),
    rateLimit({
      identifier: 'login-account-failures',
      windowMs: 15 * 60 * 1000,
      limit: 10,
      skipSuccessfulRequests: true,
      keyGenerator: (request) => {
        const body: unknown = request.body;
        const email = z.object({ email: z.string().max(512) }).safeParse(body);
        const mailbox = email.success ? normalizeEmail(email.data.email) : '';
        const digest = createHash('sha256').update(mailbox).digest('hex');
        return `${ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? 'unknown')}:${digest}`;
      },
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts. Try again later.',
        },
      },
    }),
    async (request, response) => {
      const parsed = loginSchema.safeParse(request.body as unknown);
      if (!parsed.success)
        throw new ApplicationError('VALIDATION_ERROR', 'Invalid login data');
      const result = await services.login.execute({
        email: parsed.data.email,
        password: parsed.data.password,
        ...(parsed.data.workspaceId !== undefined
          ? { workspaceId: parsed.data.workspaceId }
          : {}),
      });
      setRefreshCookie(
        response,
        services.secureCookies,
        result.refreshToken,
        result.refreshExpiresAt,
      );
      response.json({
        success: true,
        data: {
          ...result.identity,
          accessToken: result.accessToken,
          tokenType: 'Bearer',
          expiresIn: result.expiresIn,
        },
      });
    },
  );

  router.post(
    '/refresh',
    trustedOrigin,
    emptyBody,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many refresh attempts. Try again later.',
        },
      },
    }),
    async (request, response) => {
      try {
        const result = await services.refresh.execute(
          readRefreshCookie(request.get('cookie'), services.secureCookies),
        );
        setRefreshCookie(
          response,
          services.secureCookies,
          result.refreshToken,
          result.refreshExpiresAt,
        );
        response.json({
          success: true,
          data: {
            ...result.identity,
            accessToken: result.accessToken,
            tokenType: 'Bearer',
            expiresIn: result.expiresIn,
          },
        });
      } catch (error: unknown) {
        if (
          error instanceof ApplicationError &&
          error.code === 'UNAUTHENTICATED'
        )
          clearRefreshCookie(response, services.secureCookies);
        throw error;
      }
    },
  );

  router.post(
    '/logout',
    trustedOrigin,
    emptyBody,
    async (request, response) => {
      await services.logout.execute(
        readRefreshCookie(request.get('cookie'), services.secureCookies),
      );
      clearRefreshCookie(response, services.secureCookies);
      response.status(204).end();
    },
  );

  const me: AuthenticatedHandler = (_request, response) => {
    response.json({ success: true, data: response.locals.identity });
  };
  router.get('/me', createAuthenticationMiddleware(services.authenticate), me);
  return router;
}
