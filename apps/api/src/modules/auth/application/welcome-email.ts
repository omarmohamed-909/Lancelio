import { WelcomeDeliveryError } from './ports/welcome-email.js';
import type { WelcomeMailer, WelcomeStore } from './ports/welcome-email.js';
import type { Clock } from './ports/session-tokens.js';

export class WelcomeEmail {
  constructor(
    private readonly store: WelcomeStore,
    private readonly mailer: WelcomeMailer | null,
    private readonly clock: Clock,
  ) {}
  async deliverNext() {
    if (!this.mailer) return false;
    const job = await this.store.claim(this.clock.now());
    if (!job) return false;
    try {
      await this.mailer.send(job, `welcome/${job.userId}/v1`);
      await this.store.finish(job, this.clock.now());
    } catch (error: unknown) {
      await this.store.fail(
        job,
        this.clock.now(),
        !(error instanceof WelcomeDeliveryError) || error.retryable,
      );
    }
    return true;
  }
}
