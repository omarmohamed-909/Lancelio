import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validatePasswordChange } from '../domain/password-change.js';
import type { PasswordChangeInput } from '../domain/password-change.js';
import { unauthenticated } from '../domain/session.js';
import type { SessionClaims } from '../domain/session.js';
import type { PasswordChangeStore } from './ports/password-change-store.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import type { Clock, PasswordVerifier } from './ports/session-tokens.js';

export class ChangePassword {
  constructor(
    private readonly store: PasswordChangeStore,
    private readonly verifier: PasswordVerifier,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}
  async execute(scope: SessionClaims, input: PasswordChangeInput) {
    const validated = validatePasswordChange(input);
    if (!(await this.store.reserveAttempt(scope.userId, this.clock.now())))
      throw new ApplicationError(
        'RATE_LIMITED',
        'Too many password change attempts',
      );
    const hash = await this.store.findHash(scope.userId);
    if (hash === null) throw unauthenticated();
    if (hash === '')
      throw new ApplicationError(
        'PASSWORD_NOT_SET',
        'Set a password using email recovery first',
      );
    if (!(await this.verifier.verify(hash, validated.currentPassword)))
      throw new ApplicationError(
        'CURRENT_PASSWORD_INCORRECT',
        'Current password is incorrect',
      );
    const next = await this.hasher.hash(validated.newPassword);
    await this.store.change(scope, hash, next, this.clock.now());
  }
}
