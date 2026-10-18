import type { SessionClaims } from '../../domain/session.js';

export interface RefreshSession extends SessionClaims {
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly consumed: boolean;
}

export interface RefreshSessionStore {
  findByTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  rotate(
    tokenHash: string,
    nextHash: string,
    now: Date,
  ): Promise<'rotated' | 'reused' | 'invalid'>;
  revokeByTokenHash(tokenHash: string, now: Date): Promise<void>;
}

export interface RefreshTokenCodec {
  createRefreshSecret(): { token: string; tokenHash: string };
  hashRefreshToken(token: string): string;
}
