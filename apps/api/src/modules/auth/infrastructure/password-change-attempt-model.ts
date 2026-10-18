import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const schema = new Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { strict: 'throw' },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export function createPasswordChangeAttemptModel(database: Connection) {
  return database.model('PasswordChangeAttempt', schema);
}
export type PasswordChangeAttemptModel = ReturnType<
  typeof createPasswordChangeAttemptModel
>;
