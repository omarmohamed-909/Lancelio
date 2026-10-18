import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const entry = new Schema({
  requestId: { type: String, required: true },
  amountMinor: { type: Number, required: true },
  paidOn: { type: String, required: true },
  method: {
    type: String,
    enum: ['bank_transfer', 'cash', 'wallet', 'other'],
    required: true,
  },
  reference: { type: String, default: '' },
  memo: { type: String, default: '' },
  createdAt: { type: Date, required: true },
  voidedAt: { type: Date, default: null },
  voidReason: { type: String, default: null },
});
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    invoice: { type: Schema.Types.ObjectId, required: true, immutable: true },
    version: { type: Number, required: true },
    entries: { type: [entry], required: true },
  },
  { versionKey: false, strict: 'throw' },
);
schema.index({ workspace: 1, invoice: 1 }, { unique: true });
export function createPaymentLedgerModel(connection: Connection) {
  return connection.model('PaymentLedger', schema);
}
export type PaymentLedgerModel = ReturnType<typeof createPaymentLedgerModel>;
