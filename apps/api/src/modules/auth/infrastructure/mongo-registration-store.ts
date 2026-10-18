import { mongo, Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type {
  NewOwnerAccount,
  RegistrationStore,
} from '../application/ports/registration-store.js';
import type { AccountSummary } from '../domain/registration.js';
import type { RegistrationModels } from './registration-models.js';

export class MongoRegistrationStore implements RegistrationStore {
  constructor(
    private readonly connection: Connection,
    private readonly models: RegistrationModels,
  ) {}

  async createOwnerAccount(account: NewOwnerAccount): Promise<AccountSummary> {
    try {
      return await this.connection.transaction(
        async (session) => {
          const user = new this.models.User({
            name: account.name,
            email: account.email,
            passwordHash: account.passwordHash,
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

          return {
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
          };
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
