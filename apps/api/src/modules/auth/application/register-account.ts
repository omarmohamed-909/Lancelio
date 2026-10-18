import { validateRegistration } from '../domain/registration.js';
import type {
  AccountSummary,
  RegistrationInput,
} from '../domain/registration.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import type { RegistrationStore } from './ports/registration-store.js';

export class RegisterAccount {
  constructor(
    private readonly store: RegistrationStore,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: RegistrationInput): Promise<AccountSummary> {
    const registration = validateRegistration(input);
    const passwordHash = await this.passwordHasher.hash(registration.password);
    return this.store.createOwnerAccount({
      name: registration.name,
      email: registration.email,
      workspaceName: registration.workspaceName,
      passwordHash,
    });
  }
}
