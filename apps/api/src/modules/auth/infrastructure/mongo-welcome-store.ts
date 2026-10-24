import { randomUUID } from 'node:crypto';
import type {
  WelcomeJob,
  WelcomeStore,
} from '../application/ports/welcome-email.js';
import type { RegistrationModels } from './registration-models.js';

export class MongoWelcomeStore implements WelcomeStore {
  constructor(
    private readonly users: RegistrationModels['User'],
    private readonly userIds?: readonly string[],
  ) {}
  async claim(now: Date) {
    const lease = randomUUID();
    const user = await this.users
      .findOneAndUpdate(
        {
          ...(this.userIds ? { _id: { $in: this.userIds } } : {}),
          status: 'active',
          'welcomeEmail.state': 'pending',
          'welcomeEmail.expiresAt': { $gt: now },
          'welcomeEmail.nextAttemptAt': { $lte: now },
          $expr: { $eq: ['$email', '$welcomeEmail.email'] },
          $or: [
            { 'welcomeEmail.leasedUntil': null },
            { 'welcomeEmail.leasedUntil': { $lte: now } },
          ],
        },
        {
          $set: {
            'welcomeEmail.lease': lease,
            'welcomeEmail.leasedUntil': new Date(now.getTime() + 60000),
          },
          $inc: { 'welcomeEmail.attempts': 1 },
        },
        {
          returnDocument: 'after',
          sort: { 'welcomeEmail.nextAttemptAt': 1, _id: 1 },
        },
      )
      .select('+welcomeEmail')
      .lean();
    const value = user?.welcomeEmail;
    if (!user || !value) return null;
    return {
      userId: user._id.toHexString(),
      lease,
      attempts: value.attempts ?? 1,
      kind:
        value.kind === 'existing' ? ('existing' as const) : ('signup' as const),
      name: value.name,
      email: value.email,
      workspaceName: value.workspaceName,
      language: value.language as 'ar' | 'en',
    };
  }
  async finish(job: WelcomeJob, now: Date) {
    await this.users.updateOne(
      {
        _id: job.userId,
        'welcomeEmail.lease': job.lease,
        'welcomeEmail.state': 'pending',
      },
      {
        $set: {
          'welcomeEmail.state': 'sent',
          'welcomeEmail.sentAt': now,
          'welcomeEmail.lease': null,
          'welcomeEmail.leasedUntil': null,
        },
      },
    );
  }
  async fail(job: WelcomeJob, now: Date, retryable: boolean) {
    await this.users.updateOne(
      {
        _id: job.userId,
        'welcomeEmail.lease': job.lease,
        'welcomeEmail.state': 'pending',
      },
      {
        $set: {
          'welcomeEmail.state': retryable ? 'pending' : 'failed',
          'welcomeEmail.nextAttemptAt': new Date(
            now.getTime() +
              Math.min(300000, 30000 * 2 ** Math.min(job.attempts - 1, 4)),
          ),
          'welcomeEmail.lease': null,
          'welcomeEmail.leasedUntil': null,
        },
      },
    );
  }
}
