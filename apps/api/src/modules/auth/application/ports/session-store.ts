import type {
  AuthenticatedIdentity,
  SessionClaims,
} from '../../domain/session.js';

export interface LoginCredentials {
  readonly userId: string;
  readonly passwordHash: string | null;
  readonly status: string;
  readonly passwordLoginNeedsVerification?: boolean;
}

export interface NewSession extends SessionClaims {
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
}

export interface SessionStore {
  findCredentials(email: string): Promise<LoginCredentials | null>;
  findIdentity(
    userId: string,
    workspaceId?: string,
  ): Promise<AuthenticatedIdentity | null>;
  createSession(
    session: NewSession,
    expectedPasswordHash: string | null,
    method?: 'password' | 'google',
  ): Promise<void>;
  isSessionActive(claims: SessionClaims, now: Date): Promise<boolean>;
}
