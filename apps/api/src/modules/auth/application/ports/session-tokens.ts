import type { SessionClaims } from '../../domain/session.js';

export interface SessionTokens {
  createRefreshCredentials(): {
    sessionId: string;
    token: string;
    tokenHash: string;
  };
  signAccess(claims: SessionClaims, now: Date): Promise<string>;
  verifyAccess(token: string, now: Date): Promise<SessionClaims | null>;
}

export interface PasswordVerifier {
  verify(passwordHash: string | null, password: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}
