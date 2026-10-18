import type { AccountSummary } from '../../domain/registration.js';

export interface NewOwnerAccount {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly workspaceName: string;
}

export interface RegistrationStore {
  createOwnerAccount(account: NewOwnerAccount): Promise<AccountSummary>;
}
