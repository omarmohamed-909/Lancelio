import { mongo, Types } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type {
  NewOwnerAccount,
  RegistrationStore,
} from '../application/ports/registration-store.js';
import type { AccountSummary } from '../domain/registration.js';
import type { RegistrationModels } from './registration-models.js';
import type { RegistrationSessionStore } from '../application/ports/registration-session-store.js';
import type { SessionModel } from './session-model.js';
import { newWelcomeEmail } from './welcome-email-model.js';
import type { Clock } from '../application/ports/session-tokens.js';

export class MongoRegistrationStore
  implements RegistrationStore, RegistrationSessionStore
{
  constructor(
    private readonly connection: Connection,
    private readonly models: RegistrationModels,
    private readonly sessions?: SessionModel,
    private readonly welcomeEnabled = false,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async createOwnerAccount(account: NewOwnerAccount): Promise<AccountSummary> {
    return this.persist(account, async (identity) => identity);
  }

  async createOwnerAccountAndSession(
    account: NewOwnerAccount,
    issue: Parameters<
      RegistrationSessionStore['createOwnerAccountAndSession']
    >[1],
  ) {
    const sessions = this.sessions;
    if (!sessions)
      throw new Error('Registration session persistence is not configured');
    return this.persist(account, async (identity, session) => {
      const grant = await issue(identity);
      await sessions.create(
        [
          {
            _id: grant.sessionId,
            user: identity.user.id,
            workspace: identity.workspace.id,
            refreshTokenHash: grant.refreshTokenHash,
            expiresAt: grant.refreshExpiresAt,
          },
        ],
        { session },
      );
      return { identity, grant };
    });
  }

  private async persist<T>(
    account: NewOwnerAccount,
    complete: (identity: AccountSummary, session: ClientSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.connection.transaction(
        async (session) => {
          const user = new this.models.User({
            name: account.name,
            email: account.email,
            passwordHash: account.passwordHash,
            ...(this.welcomeEnabled
              ? {
                  welcomeEmail: newWelcomeEmail(
                    account.name,
                    account.email,
                    account.workspaceName,
                    account.locale ?? 'en',
                    this.clock.now(),
                  ),
                }
              : {}),
          });
          await user.save({ session });

          const workspaceId = new Types.ObjectId();
          const workspace = new this.models.Workspace({
            _id: workspaceId,
            name: account.workspaceName,
            slug: `workspace-${workspaceId.toHexString()}`,
            owner: user._id,
          });
          await workspace.save({ session });

          const membership = new this.models.Membership({
            user: user._id,
            workspace: workspace._id,
            role: 'owner',
          });
          await membership.save({ session });

          return complete(
            {
              user: {
                id: user._id.toHexString(),
                name: user.name,
                email: user.email,
              },
              workspace: {
                id: workspace._id.toHexString(),
                name: workspace.name,
                slug: workspace.slug,
              },
              membership: {
                id: membership._id.toHexString(),
                role: 'owner' as const,
              },
            },
            session,
          );
        },
        {
          readPreference: 'primary',
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        },
      );
    } catch (error: unknown) {
      if (
        error instanceof mongo.MongoServerError &&
        error.code === 11000 &&
        error.keyPattern?.email === 1
      ) {
        throw new ApplicationError(
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }
}
