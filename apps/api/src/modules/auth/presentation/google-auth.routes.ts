import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { GoogleSignIn } from '../application/google-sign-in.js';
import { setRefreshCookie } from './refresh-cookie.js';

export interface GoogleAuthEndpoints {
  clientId: string;
  secureCookies: boolean;
  signIn: GoogleSignIn;
  challenge(nonce: string, expiresAt: Date): Promise<void>;
}
const schema = z.strictObject({
  credential: z.string().min(1).max(16384),
  name: z.string().max(500).optional(),
  workspaceName: z.string().max(500).optional(),
  locale: z.enum(['ar', 'en']).optional(),
});
export function createGoogleAuthRouter(
  webOrigin: string,
  services?: GoogleAuthEndpoints,
) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/google/config', (_request, response) => {
    response.json({
      success: true,
      data: services
        ? { enabled: true, clientId: services.clientId }
        : { enabled: false },
    });
  });
  const trusted: RequestHandler = (request, _response, next) => {
    if (request.get('origin') !== webOrigin)
      throw new ApplicationError(
        'UNTRUSTED_ORIGIN',
        'Request origin is not allowed',
      );
    if (!services)
      throw new ApplicationError(
        'GOOGLE_UNAVAILABLE',
        'Google sign-in is not configured',
      );
    next();
  };
  const challengeLimit = rateLimit({
    identifier: 'google-challenges',
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many Google sign-in preparations. Try again later.',
      },
    },
  });
  const exchangeLimit = rateLimit({
    identifier: 'google-exchanges',
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many Google sign-in attempts. Try again later.',
      },
    },
  });
  const secure = services?.secureCookies ?? true;
  const cookie = secure ? '__Host-lancelio_google' : 'lancelio_google';
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
  };
  router.post(
    '/google/challenge',
    trusted,
    challengeLimit,
    async (request, response) => {
      if (!z.strictObject({}).safeParse(request.body).success)
        throw new ApplicationError('VALIDATION_ERROR', 'No fields accepted');
      const nonce = randomBytes(32).toString('base64url');
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await services!.challenge(nonce, expires);
      response.cookie(cookie, nonce, { ...cookieOptions, expires });
      response.json({ success: true, data: { nonce } });
    },
  );
  router.post('/google', trusted, exchangeLimit, async (request, response) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Invalid Google sign-in request',
      );
    const header = request.get('cookie');
    const matches =
      header && header.length <= 8192
        ? header
            .split(';')
            .map((value) => value.trim())
            .filter((value) => value.startsWith(`${cookie}=`))
        : [];
    const nonce =
      matches.length === 1 ? matches[0]!.slice(cookie.length + 1) : '';
    if (!/^[A-Za-z0-9_-]{43}$/u.test(nonce))
      throw new ApplicationError(
        'GOOGLE_INVALID_CREDENTIALS',
        'Choose your Google account again',
      );
    const data = parsed.data;
    const result = await services!.signIn.execute({
      credential: data.credential,
      nonce,
      ...(data.locale !== undefined ? { locale: data.locale } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.workspaceName !== undefined
        ? { workspaceName: data.workspaceName }
        : {}),
    });
    if (result.kind !== 'authenticated') {
      response.json({ success: true, data: result });
      return;
    }
    response.clearCookie(cookie, cookieOptions);
    setRefreshCookie(
      response,
      secure,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    response.json({
      success: true,
      data: {
        kind: 'authenticated',
        ...result.identity,
        accessToken: result.accessToken,
        tokenType: 'Bearer',
        expiresIn: result.expiresIn,
      },
    });
  });
  return router;
}
