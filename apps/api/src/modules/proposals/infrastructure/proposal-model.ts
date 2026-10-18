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
const item = new Schema(
  {
    title: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPriceMinor: { type: Number, required: true },
    totalMinor: { type: Number, required: true },
  },
  { _id: false },
);
const share = new Schema(
  {
    digest: { type: String, default: null },
    senderName: { type: String, required: true },
    allowResponse: { type: Boolean, default: false },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { _id: false },
);
const decision = new Schema(
  {
    requestId: { type: String, required: true },
    grantDigest: { type: String, required: true },
    outcome: { type: String, enum: ['accepted', 'rejected'], required: true },
    at: { type: Date, required: true },
    project: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    client: { type: client, required: true },
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
    share: { type: share, default: null },
    decision: { type: decision, default: null },
    status: {
      type: String,
      enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'],
      default: 'draft',
      required: true,
    },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
);
schema.index({ workspace: 1, _id: -1 });
schema.index(
  { 'share.digest': 1 },
  {
    unique: true,
    partialFilterExpression: { 'share.digest': { $type: 'string' } },
  },
);
export function createProposalModel(connection: Connection) {
  return connection.model('Proposal', schema);
}
export type ProposalModel = ReturnType<typeof createProposalModel>;
