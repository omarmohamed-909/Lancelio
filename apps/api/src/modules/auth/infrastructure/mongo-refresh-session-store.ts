import type {
  RefreshSession,
  RefreshSessionStore,
} from '../application/ports/refresh-session-store.js';
import type { ConsumedRefreshModel } from './consumed-refresh-model.js';
import type { SessionModel } from './session-model.js';

export class MongoRefreshSessionStore implements RefreshSessionStore {
  constructor(
    private readonly sessions: SessionModel,
    private readonly consumed: ConsumedRefreshModel,
  ) {}

  async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    let wasConsumed = false;
    let session = await this.sessions
      .findOne({ refreshTokenHash: tokenHash })
      .lean();
    if (!session) {
      const consumed = await this.consumed.findById(tokenHash).lean();
      if (consumed) {
        wasConsumed = true;
        session = await this.sessions.findById(consumed.session).lean();
      }
    }
    return session
      ? {
          sessionId: session._id,
          userId: session.user.toHexString(),
          workspaceId: session.workspace.toHexString(),
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt ?? null,
          consumed: wasConsumed,
        }
      : null;
  }

  async rotate(tokenHash: string, nextHash: string, now: Date) {
    // Return a failure result instead of throwing inside the transaction: replay revocation must commit.
    return this.sessions.db.transaction(
      async (transaction) => {
        const current = await this.sessions
          .findOne({ refreshTokenHash: tokenHash })
          .session(transaction)
          .lean();
        if (current) {
          if (current.revokedAt || current.expiresAt.getTime() <= now.getTime())
            return 'invalid' as const;
          const updated = await this.sessions.updateOne(
            {
              _id: current._id,
              refreshTokenHash: tokenHash,
              revokedAt: null,
              expiresAt: { $gt: now },
            },
            { $set: { refreshTokenHash: nextHash } },
            { session: transaction },
          );
          if (updated.modifiedCount !== 1) return 'invalid' as const;
          await this.consumed.create(
            [
              {
                _id: tokenHash,
                session: current._id,
                expiresAt: current.expiresAt,
              },
            ],
            { session: transaction },
          );
          return 'rotated' as const;
        }
        const previous = await this.consumed
          .findById(tokenHash)
          .session(transaction)
          .lean();
        if (!previous) return 'invalid' as const;
        await this.sessions.updateOne(
          { _id: previous.session, revokedAt: null },
          { $set: { revokedAt: now } },
          { session: transaction },
        );
        return 'reused' as const;
      },
      {
        readPreference: 'primary',
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  }

  async revokeByTokenHash(tokenHash: string, now: Date) {
    const session = await this.findByTokenHash(tokenHash);
    if (session)
      await this.sessions.updateOne(
        { _id: session.sessionId, revokedAt: null },
        { $set: { revokedAt: now } },
      );
  }
}
