import type {
  RecoveryJob,
  RecoveryStore,
} from '../application/ports/password-recovery.js';
import { recoveryPolicy } from '../domain/password-recovery.js';
import type { RecoveryModels } from './recovery-models.js';
import type { RegistrationModels } from './registration-models.js';
import type { SessionModel } from './session-model.js';
const transactionOptions = {
  readPreference: 'primary' as const,
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
};
export class MongoRecoveryStore implements RecoveryStore {
  constructor(
    private readonly models: RecoveryModels,
    private readonly users: RegistrationModels['User'],
    private readonly sessions: SessionModel,
  ) {}
  async enqueue(
    job: { id: string; mailbox: string; payload: string },
    now: Date,
  ) {
    try {
      await this.users.db.transaction(async (transaction) => {
        const mailbox = await this.models.Mailbox.findById(job.mailbox)
          .session(transaction)
          .lean();
        const inWindow =
          mailbox && now.getTime() - mailbox.windowStart.getTime() < 3_600_000;
        if (
          mailbox &&
          (now.getTime() - mailbox.lastRequestedAt.getTime() <
            recoveryPolicy.cooldownMs ||
            (inWindow && mailbox.count >= recoveryPolicy.hourlyLimit))
        )
          return;
        await this.models.Mailbox.updateOne(
          { _id: job.mailbox },
          {
            $set: {
              lastRequestedAt: now,
              windowStart: inWindow ? mailbox.windowStart : now,
              count: inWindow ? mailbox.count + 1 : 1,
              expiresAt: new Date(now.getTime() + 3_600_000),
            },
          },
          { upsert: true, session: transaction },
        );
        await this.models.Job.create(
          [
            {
              _id: job.id,
              payload: job.payload,
              requestedAt: now,
              expiresAt: new Date(now.getTime() + recoveryPolicy.lifetimeMs),
              nextAttemptAt: now,
            },
          ],
          { session: transaction },
        );
      }, transactionOptions);
    } catch (error: unknown) {
      // Concurrent first requests for one mailbox can collide on its unique index.
      if (!(
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ))
        throw error;
    }
  }
  async claim(lease: string, now: Date) {
    const job = await this.models.Job.findOneAndUpdate(
      {
        done: false,
        invalidatedAt: null,
        expiresAt: { $gt: now },
        nextAttemptAt: { $lte: now },
        $or: [{ leasedUntil: null }, { leasedUntil: { $lte: now } }],
      },
      {
        $set: {
          lease,
          leasedUntil: new Date(now.getTime() + recoveryPolicy.leaseMs),
        },
      },
      { returnDocument: 'after', sort: { nextAttemptAt: 1, _id: 1 } },
    )
      .select('+payload')
      .lean();
    return job
      ? { id: job._id, payload: job.payload, lease, expiresAt: job.expiresAt }
      : null;
  }
  async prepare(job: RecoveryJob, email: string, now: Date) {
    return this.users.db.transaction(async (transaction) => {
      const current = await this.models.Job.findOne({
        _id: job.id,
        lease: job.lease,
        invalidatedAt: null,
        expiresAt: { $gt: now },
      })
        .select('+credentialHash')
        .session(transaction)
        .lean();
      if (!current) return false;
      if (current.user)
        return (
          (await this.users
            .exists({
              _id: current.user,
              status: 'active',
              passwordHash: current.credentialHash ?? null,
            })
            .session(transaction)) !== null
        );
      const user = await this.users
        .findOne({ email, status: 'active' })
        .select('+passwordHash')
        .session(transaction)
        .lean();
      if (
        !user ||
        (user.passwordChangedAt &&
          user.passwordChangedAt.getTime() >= current.requestedAt.getTime())
      )
        return false;
      // The user write serializes issuance with reset, even for a job not yet bound to a user.
      await this.users.updateOne(
        { _id: user._id },
        { $inc: { authFence: 1 } },
        { session: transaction },
      );
      await this.models.Job.updateOne(
        { _id: job.id, lease: job.lease },
        { $set: { user: user._id, credentialHash: user.passwordHash ?? null } },
        { session: transaction },
      );
      return true;
    }, transactionOptions);
  }
  async finish(job: RecoveryJob) {
    await this.models.Job.updateOne(
      { _id: job.id, lease: job.lease },
      { $set: { done: true, payload: '', lease: null, leasedUntil: null } },
    );
  }
  async retry(job: RecoveryJob, now: Date) {
    await this.models.Job.updateOne(
      { _id: job.id, lease: job.lease },
      {
        $set: {
          lease: null,
          leasedUntil: null,
          nextAttemptAt: new Date(now.getTime() + recoveryPolicy.retryMs),
        },
      },
    );
  }
  async canReset(id: string, now: Date) {
    const job = await this.models.Job.findOne({
      _id: id,
      user: { $ne: null },
      invalidatedAt: null,
      expiresAt: { $gt: now },
    })
      .select('+credentialHash')
      .lean();
    return job?.user
      ? (await this.users.exists({
          _id: job.user,
          status: 'active',
          passwordHash: job.credentialHash ?? null,
        })) !== null
      : false;
  }
  async reset(id: string, passwordHash: string, now: Date) {
    return this.users.db.transaction(async (transaction) => {
      const job = await this.models.Job.findOne({
        _id: id,
        user: { $ne: null },
        invalidatedAt: null,
        expiresAt: { $gt: now },
      })
        .select('+credentialHash')
        .session(transaction)
        .lean();
      if (!job?.user) return false;
      const updated = await this.users.updateOne(
        {
          _id: job.user,
          status: 'active',
          passwordHash: job.credentialHash ?? null,
        },
        {
          $set: {
            passwordHash,
            passwordChangedAt: now,
            passwordLoginNeedsVerification: false,
          },
          $inc: { authFence: 1 },
        },
        { session: transaction },
      );
      if (updated.modifiedCount !== 1) return false;
      await this.models.Job.updateMany(
        { user: job.user, invalidatedAt: null },
        { $set: { invalidatedAt: now, payload: '', done: true } },
        { session: transaction },
      );
      await this.sessions.updateMany(
        { user: job.user, revokedAt: null },
        { $set: { revokedAt: now } },
        { session: transaction },
      );
      return true;
    }, transactionOptions);
  }
}
