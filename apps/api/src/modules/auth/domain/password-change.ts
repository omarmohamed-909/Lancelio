import { ApplicationError } from '../../../shared/domain/application-error.js';
import { isValidNewPassword } from './credential-policy.js';

export const passwordChangePolicy = {
  windowMs: 15 * 60_000,
  attempts: 5,
} as const;
export interface PasswordChangeInput {
  readonly currentPassword: string;
  readonly newPassword: string;
}
export function validatePasswordChange(input: PasswordChangeInput) {
  const length = Array.from(input.currentPassword).length;
  if (
    length < 1 ||
    length > 128 ||
    !isValidNewPassword(input.newPassword) ||
    input.currentPassword === input.newPassword
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid password change');
  return input;
}
