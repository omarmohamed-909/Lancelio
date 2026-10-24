import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    client: { type: Schema.Types.ObjectId, required: true, immutable: true },
    email: { type: String, required: true },
    digest: { type: String, default: null, select: false },
    version: { type: Number, required: true },
    state: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'revoked'],
      required: true,
    },
    user: { type: Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
);
schema.index({ workspace: 1, client: 1 }, { unique: true });
schema.index({ email: 1, state: 1, _id: -1 });
schema.index({ user: 1, state: 1, _id: -1 });
schema.index(
  { digest: 1 },
  { unique: true, partialFilterExpression: { digest: { $type: 'string' } } },
);
export function createClientAccessModel(connection: Connection) {
  return connection.model('ClientAccess', schema);
}
export type ClientAccessModel = ReturnType<typeof createClientAccessModel>;
