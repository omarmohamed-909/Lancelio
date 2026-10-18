import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const jobSchema = new Schema(
  {
    _id: { type: String, required: true },
    payload: { type: String, required: true, select: false },
    requestedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    nextAttemptAt: { type: Date, required: true },
    lease: { type: String, default: null },
    leasedUntil: { type: Date, default: null },
    done: { type: Boolean, default: false },
    user: { type: Schema.Types.ObjectId, default: null },
    credentialHash: { type: String, default: null, select: false },
    invalidatedAt: { type: Date, default: null },
  },
  { strict: 'throw' },
);
jobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
jobSchema.index({ done: 1, nextAttemptAt: 1, leasedUntil: 1 });
jobSchema.index({ user: 1 });
const mailboxSchema = new Schema(
  {
    _id: { type: String, required: true },
    lastRequestedAt: { type: Date, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { strict: 'throw' },
);
mailboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export function createRecoveryModels(database: Connection) {
  return {
    Job: database.model('PasswordRecovery', jobSchema),
    Mailbox: database.model('RecoveryMailbox', mailboxSchema),
  };
}
export type RecoveryModels = ReturnType<typeof createRecoveryModels>;
