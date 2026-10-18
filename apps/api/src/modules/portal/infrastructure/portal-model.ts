import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    client: { type: Schema.Types.ObjectId, required: true, immutable: true },
    version: { type: Number, required: true, min: 1 },
    digest: { type: String, default: null },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { strict: 'throw', versionKey: false },
);
schema.index({ workspace: 1, client: 1 }, { unique: true });
schema.index(
  { digest: 1 },
  { unique: true, partialFilterExpression: { digest: { $type: 'string' } } },
);
export function createPortalModel(database: Connection) {
  return database.model('ClientPortalGrant', schema);
}
export type PortalModel = ReturnType<typeof createPortalModel>;
