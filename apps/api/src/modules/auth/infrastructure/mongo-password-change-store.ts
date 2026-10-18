import type { PasswordChangeStore } from '../application/ports/password-change-store.js';
import { passwordChangePolicy } from '../domain/password-change.js';
import { unauthenticated } from '../domain/session.js';
import type { SessionClaims } from '../domain/session.js';
import type { RegistrationModels } from './registration-models.js';
import type { SessionModel } from './session-model.js';
import type { RecoveryModels } from './recovery-models.js';
import type { PasswordChangeAttemptModel } from './password-change-attempt-model.js';
export class MongoPasswordChangeStore implements PasswordChangeStore {
  constructor(
    private readonly models: RegistrationModels,
    private readonly sessions: SessionModel,
    private readonly jobs: RecoveryModels['Job'],
    private readonly attempts: PasswordChangeAttemptModel,
  ) {}
  async reserveAttempt(userId: string, now: Date) {
    const bucket = Math.floor(now.getTime() / passwordChangePolicy.windowMs);
    const value = await this.attempts
      .findOneAndUpdate(
        { _id: `${userId}:${bucket}` },
        {
          $inc: { count: 1 },
          $setOnInsert: {
            expiresAt: new Date((bucket + 1) * passwordChangePolicy.windowMs),
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean();
    return value !== null && value.count <= passwordChangePolicy.attempts;
  }
  async findHash(userId: string) {
    const user = await this.models.User.findOne({
      _id: userId,
      status: 'active',
    })
      .select('+passwordHash')
      .lean();
    return user?.passwordHash ?? null;
  }
  async change(
    scope: SessionClaims,
    expectedHash: string,
    newHash: string,
    now: Date,
  ) {
    await this.models.User.db.transaction(
      async (transaction) => {
        // This write conflicts with logout/rotation; a revoked request cannot commit later.
        const session = await this.sessions.updateOne(
          {
            _id: scope.sessionId,
            user: scope.userId,
            workspace: scope.workspaceId,
            revokedAt: null,
            expiresAt: { $gt: now },
          },
          { $set: { revokedAt: now } },
          { session: transaction },
        );
        if (
          session.modifiedCount !== 1 ||
          !(await this.models.Membership.exists({
            user: scope.userId,
            workspace: scope.workspaceId,
          }).session(transaction)) ||
          !(await this.models.Workspace.exists({
            _id: scope.workspaceId,
          }).session(transaction))
        )
          throw unauthenticated();
        const user = await this.models.User.updateOne(
          {
            _id: scope.userId,
            status: 'active',
            passwordHash: expectedHash,
          },
          {
            $set: { passwordHash: newHash, passwordChangedAt: now },
            $inc: { authFence: 1 },
          },
          { session: transaction },
        );
        if (user.modifiedCount !== 1) throw unauthenticated();
        await this.sessions.updateMany(
          { user: scope.userId, revokedAt: null },
          { $set: { revokedAt: now } },
          { session: transaction },
        );
        await this.jobs.updateMany(
          { user: scope.userId, invalidatedAt: null },
          { $set: { invalidatedAt: now, payload: '', done: true } },
          { session: transaction },
        );
      },
      {
        readPreference: 'primary',
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  }
}
