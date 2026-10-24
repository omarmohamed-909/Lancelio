import { ApplicationError } from '../../../shared/domain/application-error.js';
import { isValidDisplayName } from './display-name.js';

import {
  normalizeEmail,
  isValidEmail,
  isValidNewPassword,
} from './credential-policy.js';

export interface RegistrationInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly workspaceName?: string;
  readonly locale?: 'ar' | 'en';
}

export interface AccountSummary {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
  readonly workspace: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly membership: { readonly id: string; readonly role: 'owner' };
}

export function validateRegistration(input: RegistrationInput) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const workspaceName = input.workspaceName?.trim() ?? name;
  const fields: Record<string, string> = {};

  if (!isValidDisplayName(name))
    fields.name = 'Name must contain 2 to 100 characters';
  if (!isValidEmail(email)) fields.email = 'A valid email address is required';
  if (!isValidNewPassword(input.password))
    fields.password = 'Password must contain 15 to 128 characters';
  if (!isValidDisplayName(workspaceName))
    fields.workspaceName = 'Workspace name must contain 2 to 100 characters';

  if (Object.keys(fields).length > 0) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid registration data',
      fields,
    );
  }
  return { name, email, password: input.password, workspaceName };
}
