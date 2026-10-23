import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, default: null, select: false },
    googleSubject: { type: String, default: null, select: false },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active',
      required: true,
    },
    authFence: { type: Number, default: 0 },
    profileVersion: { type: Number, default: 0, min: 0 },
    passwordChangedAt: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false, required: true },
  },
  { timestamps: true, strict: 'throw' },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.pre('validate', function () {
  if (this.isNew && !this.passwordHash && !this.googleSubject)
    this.invalidate('passwordHash', 'An authentication method is required');
});
userSchema.index(
  { googleSubject: 1 },
  {
    unique: true,
    partialFilterExpression: { googleSubject: { $type: 'string' } },
  },
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true },
    settingsVersion: { type: Number, default: 0, min: 0 },
    slug: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    plan: {
      type: String,
      enum: ['free', 'pro', 'agency'],
      default: 'free',
      required: true,
    },
  },
  { timestamps: true, strict: 'throw' },
);
workspaceSchema.index({ slug: 1 }, { unique: true });
workspaceSchema.index({ owner: 1 });

const membershipSchema = new Schema(
  {
    settingsFence: { type: Number, default: 0, select: false },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], required: true },
  },
  { timestamps: true, strict: 'throw' },
);
membershipSchema.index({ workspace: 1, user: 1 }, { unique: true });
membershipSchema.index({ user: 1 });

export function createRegistrationModels(connection: Connection) {
  return {
    User: connection.model('User', userSchema),
    Workspace: connection.model('Workspace', workspaceSchema),
    Membership: connection.model('WorkspaceMember', membershipSchema),
  };
}

export type RegistrationModels = ReturnType<typeof createRegistrationModels>;

export async function initializeRegistrationModels(models: RegistrationModels) {
  // Collections and unique indexes must exist before accepting registration traffic.
  await Promise.all(
    Object.values(models).map(async (model) => {
      await model.createCollection();
      await model.createIndexes();
    }),
  );
}
