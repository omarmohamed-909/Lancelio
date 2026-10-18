import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const client = new Schema(
  {
    id: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    company: { type: String, default: '' },
  },
  { _id: false },
);
const project = new Schema(
  {
    id: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    clientId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);
const item = new Schema(
  {
    title: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPriceMinor: { type: Number, required: true },
    totalMinor: { type: Number, required: true },
  },
  { _id: false },
);
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    requestId: { type: String, required: true, immutable: true },
    sequence: { type: Number, required: true, immutable: true },
    number: { type: String, required: true, immutable: true },
    client: { type: client, required: true },
    project: { type: project, default: null },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    terms: { type: String, default: '' },
    currency: {
      type: String,
      enum: ['EGP', 'USD', 'EUR', 'SAR'],
      required: true,
    },
    items: { type: [item], required: true },
    itemCount: { type: Number, required: true },
    totalMinor: { type: Number, required: true },
    version: { type: Number, default: 1, required: true },
    status: {
      type: String,
      enum: ['draft', 'issued'],
      default: 'draft',
      required: true,
    },
    issuedAt: { type: Date, default: null },
    senderName: { type: String, default: null },
    creationFingerprint: { type: String, default: null },
    share: {
      type: new Schema(
        {
          digest: { type: String, default: null },
          issuedAt: { type: Date, required: true },
          expiresAt: { type: Date, required: true },
          revokedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
);
schema.index({ workspace: 1, sequence: 1 }, { unique: true });
schema.index({ workspace: 1, requestId: 1 }, { unique: true });
schema.index({ workspace: 1, _id: -1 });
schema.index(
  { 'share.digest': 1 },
  {
    unique: true,
    partialFilterExpression: { 'share.digest': { $type: 'string' } },
  },
);
const counter = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    sequence: { type: Number, required: true, default: 0 },
  },
  { versionKey: false, strict: 'throw' },
);
export function createInvoiceModels(connection: Connection) {
  return {
    Invoice: connection.model('Invoice', schema),
    Counter: connection.model('InvoiceCounter', counter),
  };
}
export type InvoiceModels = ReturnType<typeof createInvoiceModels>;
export async function initializeInvoiceModels(models: InvoiceModels) {
  for (const model of [models.Invoice, models.Counter]) {
    await model.createCollection();
    await model.createIndexes();
  }
}
