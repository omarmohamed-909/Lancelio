import { ApplicationError } from '../../../shared/domain/application-error.js';
import { Types } from 'mongoose';
import type {
  NewSession,
  SessionStore,
} from '../application/ports/session-store.js';
import type {
  AuthenticatedIdentity,
  SessionClaims,
} from '../domain/session.js';
import type { RegistrationModels } from './registration-models.js';
import type { SessionModel } from './session-model.js';

export class MongoSessionStore implements SessionStore {
  constructor(
    private readonly models: RegistrationModels,
    private readonly sessions: SessionModel,
  ) {}

  async findCredentials(email: string) {
    const user = await this.models.User.findOne({ email })
      .select('+passwordHash')
      .lean();
    return user
      ? {
          userId: user._id.toHexString(),
          passwordHash: user.passwordHash,
          status: user.status,
        }
      : null;
  }

  async findIdentity(
    userId: string,
    workspaceId?: string,
  ): Promise<AuthenticatedIdentity | null> {
    if (
      !Types.ObjectId.isValid(userId) ||
      (workspaceId !== undefined && !Types.ObjectId.isValid(workspaceId))
    )
      return null;
    const user = await this.models.User.findOne({
      _id: userId,
      status: 'active',
    }).lean();
    if (!user) return null;
    const membership = await this.models.Membership.findOne({
      user: userId,
      ...(workspaceId !== undefined ? { workspace: workspaceId } : {}),
    })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    if (!membership) return null;
    const workspace = await this.models.Workspace.findById(
      membership.workspace,
    ).lean();
    if (!workspace) return null;
    const role = membership.role;
    if (role !== 'owner' && role !== 'admin' && role !== 'member') return null;
    return {
      user: { id: user._id.toHexString(), name: user.name, email: user.email },
      workspace: {
        id: workspace._id.toHexString(),
        name: workspace.name,
        slug: workspace.slug,
      },
      membership: { id: membership._id.toHexString(), role },
    };
  }

  async createSession(session: NewSession, expectedPasswordHash: string) {
    await this.sessions.db.transaction(
      async (transaction) => {
        const user = await this.models.User.updateOne(
          {
            _id: session.userId,
            status: 'active',
            passwordHash: expectedPasswordHash,
          },
          { $inc: { authFence: 1 } },
          { session: transaction },
        );
        if (user.modifiedCount !== 1)
          throw new ApplicationError(
            'INVALID_CREDENTIALS',
            'Email or password is incorrect',
          );
        await this.sessions.create(
          [
            {
              _id: session.sessionId,
              user: session.userId,
              workspace: session.workspaceId,
              refreshTokenHash: session.refreshTokenHash,
              expiresAt: session.expiresAt,
            },
          ],
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

  async isSessionActive(claims: SessionClaims, now: Date) {
    if (
      !Types.ObjectId.isValid(claims.userId) ||
      !Types.ObjectId.isValid(claims.workspaceId)
    )
      return false;
    return (
      (await this.sessions.exists({
        _id: claims.sessionId,
        user: claims.userId,
        workspace: claims.workspaceId,
        revokedAt: null,
        expiresAt: { $gt: now },
      })) !== null
    );
  }
}
