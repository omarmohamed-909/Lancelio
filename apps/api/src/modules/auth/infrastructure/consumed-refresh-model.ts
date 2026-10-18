import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';

const schema = new Schema(
  {
    _id: { type: String, required: true },
    session: { type: String, ref: 'AuthSession', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, strict: 'throw' },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ session: 1 });

export function createConsumedRefreshModel(connection: Connection) {
  return connection.model('ConsumedRefreshToken', schema);
}
export type ConsumedRefreshModel = ReturnType<
  typeof createConsumedRefreshModel
>;
