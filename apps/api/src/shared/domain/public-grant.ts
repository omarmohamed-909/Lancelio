import { ApplicationError } from './application-error.js';
export interface PublicGrant {
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
export function grantExpiry(days: number, now: Date) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 30)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Choose a lifetime of 1–30 days',
    );
  return new Date(now.getTime() + days * 86400000);
}
export function grantState(grant: PublicGrant, now: Date) {
  return grant.revokedAt
    ? ('revoked' as const)
    : grant.expiresAt <= now
      ? ('expired' as const)
      : ('active' as const);
}
