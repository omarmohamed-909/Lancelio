import type { AccountSummary } from '../../domain/registration.js';

export interface NewOwnerAccount {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly workspaceName: string;
  readonly locale?: 'ar' | 'en';
}

export interface RegistrationStore {
  createOwnerAccount(account: NewOwnerAccount): Promise<AccountSummary>;
}
