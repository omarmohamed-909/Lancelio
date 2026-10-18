import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import type { SessionTokens } from '../application/ports/session-tokens.js';
import type { RefreshTokenCodec } from '../application/ports/refresh-session-store.js';
import { sessionPolicy } from '../domain/session.js';
import type { SessionClaims } from '../domain/session.js';

const issuer = 'lancelio-api';
const audience = 'lancelio-web';

export class JoseSessionTokens implements SessionTokens, RefreshTokenCodec {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    if (Buffer.byteLength(secret, 'utf8') < 32)
      throw new Error('Access signing key must contain at least 32 bytes');
    this.key = new TextEncoder().encode(secret);
  }

  createRefreshCredentials() {
    return { sessionId: randomUUID(), ...this.createRefreshSecret() };
  }

  hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  createRefreshSecret() {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      tokenHash: this.hashRefreshToken(token),
    };
  }

  signAccess(claims: SessionClaims, now: Date) {
    const issuedAt = Math.floor(now.getTime() / 1000);
    return new SignJWT({
      sid: claims.sessionId,
      workspaceId: claims.workspaceId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(claims.userId)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + sessionPolicy.accessLifetimeSeconds)
      .sign(this.key);
  }

  async verifyAccess(token: string, now: Date): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer,
        audience,
        algorithms: ['HS256'],
        typ: 'at+jwt',
        currentDate: now,
        requiredClaims: ['sub', 'sid', 'workspaceId', 'iat', 'exp'],
        maxTokenAge: sessionPolicy.accessLifetimeSeconds,
      });
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.workspaceId !== 'string'
      )
        return null;
      return {
        userId: payload.sub,
        workspaceId: payload.workspaceId,
        sessionId: payload.sid,
      };
    } catch (error: unknown) {
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
  }
}
