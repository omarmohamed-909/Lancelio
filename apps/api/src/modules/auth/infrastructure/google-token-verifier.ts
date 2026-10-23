import { createRemoteJWKSet, jwtVerify, errors } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import { isValidEmail, normalizeEmail } from '../domain/credential-policy.js';
import type { GoogleTokenVerifier } from '../application/ports/google-auth.js';

export class JoseGoogleTokenVerifier implements GoogleTokenVerifier {
  constructor(
    private readonly clientId: string,
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(
      new URL('https://www.googleapis.com/oauth2/v3/certs'),
      { timeoutDuration: 5000 },
    ),
  ) {}
  async verify(credential: string, nonce: string, now: Date) {
    try {
      const { payload } = await jwtVerify(credential, this.keys, {
        audience: this.clientId,
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        algorithms: ['RS256'],
        currentDate: now,
        maxTokenAge: '10m',
        requiredClaims: [
          'sub',
          'email',
          'email_verified',
          'nonce',
          'iat',
          'exp',
        ],
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        payload.sub.length > 255 ||
        payload.nonce !== nonce ||
        payload.email_verified !== true ||
        typeof payload.email !== 'string' ||
        !isValidEmail(normalizeEmail(payload.email)) ||
        (payload.azp !== undefined && payload.azp !== this.clientId)
      )
        throw new Error('Invalid Google identity');
      return {
        subject: payload.sub,
        email: normalizeEmail(payload.email),
        name: typeof payload.name === 'string' ? payload.name.trim() : '',
      };
    } catch (error: unknown) {
      if (error instanceof TypeError || error instanceof errors.JWKSTimeout)
        throw new ApplicationError(
          'GOOGLE_UNAVAILABLE',
          'Google sign-in is temporarily unavailable',
        );
      throw new ApplicationError(
        'GOOGLE_INVALID_CREDENTIALS',
        'Choose your Google account again',
      );
    }
  }
}
