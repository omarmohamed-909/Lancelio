import type { AccountSummary } from '../../domain/registration.js';
import type { NewOwnerAccount } from './registration-store.js';

export interface RegistrationSessionGrant {
  sessionId: string;
  refreshTokenHash: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RegistrationSessionStore {
  createOwnerAccountAndSession(
    account: NewOwnerAccount,
    issue: (identity: AccountSummary) => Promise<RegistrationSessionGrant>,
  ): Promise<{ identity: AccountSummary; grant: RegistrationSessionGrant }>;
}
