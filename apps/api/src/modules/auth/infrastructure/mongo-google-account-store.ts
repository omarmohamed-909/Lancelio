import { createHash } from 'node:crypto';
import { mongo, Types } from 'mongoose';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type {
  GoogleAccountStore,
  GoogleProfile,
} from '../application/ports/google-auth.js';
import type { RegistrationModels } from './registration-models.js';
import type { GoogleChallengeModel } from './google-challenge-model.js';

const digest = (nonce: string) =>
  createHash('sha256').update(nonce).digest('hex');
export class MongoGoogleAccountStore implements GoogleAccountStore {
  constructor(
    private readonly models: RegistrationModels,
    private readonly challenges: GoogleChallengeModel,
  ) {}
  async challenge(nonce: string, expiresAt: Date) {
    await this.challenges.create({ _id: digest(nonce), expiresAt });
  }
  async find(profile: GoogleProfile) {
    const user =
      (await this.models.User.findOne({ googleSubject: profile.subject })
        .select('+passwordHash +googleSubject')
        .lean()) ??
      (await this.models.User.findOne({ email: profile.email })
        .select('+passwordHash +googleSubject')
        .lean());
    return user
      ? {
          userId: user._id.toHexString(),
          subject: user.googleSubject ?? null,
          passwordHash: user.passwordHash ?? null,
          status: user.status,
        }
      : null;
  }
  async complete(input: Parameters<GoogleAccountStore['complete']>[0]) {
    try {
      return await this.models.User.db.transaction(
        async (session) => {
          const challenge = await this.challenges.findOneAndDelete(
            { _id: digest(input.nonce), expiresAt: { $gt: input.now } },
            { session },
          );
          if (!challenge)
            throw new ApplicationError(
              'GOOGLE_INVALID_CREDENTIALS',
              'Choose your Google account again',
            );
          if (input.existing) {
            const known = input.existing;
            const updated = await this.models.User.updateOne(
              {
                _id: known.userId,
                status: 'active',
                googleSubject: known.subject,
                passwordHash: known.passwordHash,
              },
              {
                $set: { googleSubject: input.profile.subject },
                $inc: { authFence: 1 },
              },
              { session },
            );
            if (updated.modifiedCount !== 1)
              throw new ApplicationError(
                'GOOGLE_ACCOUNT_CONFLICT',
                'Account changed; sign in again',
              );
            // Linking adds an identity only. It never overwrites local profile or workspace data.
            return { userId: known.userId, passwordHash: known.passwordHash };
          }
          if (input.name === undefined || input.workspaceName === undefined)
            throw new ApplicationError(
              'VALIDATION_ERROR',
              'Account details are required',
            );
          const user = new this.models.User({
            name: input.name,
            email: input.profile.email,
            googleSubject: input.profile.subject,
            emailVerified: true,
            passwordHash: null,
          });
          await user.save({ session });
          const workspaceId = new Types.ObjectId();
          await this.models.Workspace.create(
            [
              {
                _id: workspaceId,
                name: input.workspaceName,
                slug: `workspace-${workspaceId.toHexString()}`,
                owner: user._id,
              },
            ],
            { session },
          );
          await this.models.Membership.create(
            [{ user: user._id, workspace: workspaceId, role: 'owner' }],
            { session },
          );
          return { userId: user._id.toHexString(), passwordHash: null };
        },
        {
          readPreference: 'primary',
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        },
      );
    } catch (error: unknown) {
      if (error instanceof mongo.MongoServerError && error.code === 11000)
        throw new ApplicationError(
          'GOOGLE_ACCOUNT_CONFLICT',
          'Account already exists; choose your Google account again',
        );
      throw error;
    }
  }
}
