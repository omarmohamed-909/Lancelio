import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';

const sessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    refreshTokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, strict: 'throw' },
);
sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1, workspace: 1 });

export function createSessionModel(connection: Connection) {
  return connection.model('AuthSession', sessionSchema);
}
export type SessionModel = ReturnType<typeof createSessionModel>;
