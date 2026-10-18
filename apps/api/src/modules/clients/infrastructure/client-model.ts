import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    company: { type: String, default: '' },
    notes: { type: String, default: '' },
    version: { type: Number, required: true, default: 1 },
    referenceRevision: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
);
schema.index({ workspace: 1, archivedAt: 1, _id: -1 });
export function createClientModel(connection: Connection) {
  return connection.model('Client', schema);
}
export type ClientModel = ReturnType<typeof createClientModel>;
