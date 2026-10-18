import type { SessionClaims } from '../../domain/session.js';
export interface PasswordChangeStore {
  reserveAttempt(userId: string, now: Date): Promise<boolean>;
  findHash(userId: string): Promise<string | null>;
  change(
    scope: SessionClaims,
    expectedHash: string,
    newHash: string,
    now: Date,
  ): Promise<void>;
}
