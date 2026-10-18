import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  normalizeEmail,
  isValidEmail,
  isValidNewPassword,
} from './credential-policy.js';
export const recoveryPolicy = {
  lifetimeMs: 30 * 60_000,
  cooldownMs: 60_000,
  hourlyLimit: 5,
  leaseMs: 30_000,
  retryMs: 30_000,
} as const;
export function recoveryEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized))
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid recovery data', {
      email: 'A valid email address is required',
    });
  return normalized;
}
export function recoveryPassword(password: string) {
  if (!isValidNewPassword(password))
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid recovery data', {
      password: 'Password must contain 15 to 128 characters',
    });
  return password;
}
export function invalidRecovery() {
  return new ApplicationError(
    'RECOVERY_INVALID',
    'This recovery link is invalid or expired',
  );
}
