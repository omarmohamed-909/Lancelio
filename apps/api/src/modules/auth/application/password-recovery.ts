import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  invalidRecovery,
  recoveryEmail,
  recoveryPassword,
} from '../domain/password-recovery.js';
import type {
  RecoveryStore,
  RecoverySecrets,
  RecoveryMailer,
} from './ports/password-recovery.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import type { Clock } from './ports/session-tokens.js';
export class PasswordRecovery {
  constructor(
    private readonly store: RecoveryStore,
    private readonly secrets: RecoverySecrets,
    private readonly hasher: PasswordHasher,
    private readonly mailer: RecoveryMailer | null,
    private readonly clock: Clock,
  ) {}
  async request(email: string) {
    const normalized = recoveryEmail(email);
    if (!this.mailer)
      throw new ApplicationError(
        'RECOVERY_UNAVAILABLE',
        'Password recovery is not configured',
      );
    // All valid mailboxes follow the same durable queue path; no account lookup or delivery here.
    await this.store.enqueue(this.secrets.create(normalized), this.clock.now());
  }
  async reset(token: string, password: string) {
    const validated = recoveryPassword(password);
    const id = this.secrets.digest(token);
    if (!id || !(await this.store.canReset(id, this.clock.now())))
      throw invalidRecovery();
    const hash = await this.hasher.hash(validated);
    if (!(await this.store.reset(id, hash, this.clock.now())))
      throw invalidRecovery();
  }
  async deliverNext() {
    if (!this.mailer) return false;
    const job = await this.store.claim(this.secrets.lease(), this.clock.now());
    if (!job) return false;
    try {
      const { email, token } = this.secrets.open(job.payload);
      if (await this.store.prepare(job, email, this.clock.now()))
        await this.mailer.send(email, token, job.id);
      await this.store.finish(job);
    } catch {
      // Do not expose recipients, links, provider responses or secrets in logs.
      await this.store.retry(job, this.clock.now());
    }
    return true;
  }
}
