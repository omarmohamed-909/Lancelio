import { mongo } from 'mongoose';
import type { InferSchemaType } from 'mongoose';
import type { PaymentLedgerModel } from './payment-ledger-model.js';
import type { PaymentStore } from '../application/ports/payment-store.js';
import type {
  PaymentEntry,
  StoredLedger,
  PaymentMethod,
} from '../domain/payment-ledger.js';
function dto(row: InferSchemaType<PaymentLedgerModel['schema']>): StoredLedger {
  return {
    version: row.version,
    entries: row.entries.map((entry) => ({
      id: entry._id.toString(),
      requestId: entry.requestId,
      amountMinor: entry.amountMinor,
      paidOn: entry.paidOn,
      method: entry.method as PaymentMethod,
      reference: entry.reference,
      memo: entry.memo,
      createdAt: entry.createdAt,
      voidedAt: entry.voidedAt ?? null,
      voidReason: entry.voidReason ?? null,
    })),
  };
}
export class MongoPaymentStore implements PaymentStore {
  constructor(private readonly model: PaymentLedgerModel) {}
  async find(workspaceId: string, invoiceId: string) {
    const row = await this.model
      .findOne({ workspace: workspaceId, invoice: invoiceId })
      .maxTimeMS(3000)
      .lean();
    return row ? dto(row) : null;
  }
  async save(
    workspaceId: string,
    invoiceId: string,
    version: number,
    entries: PaymentEntry[],
  ) {
    const stored = entries.map(({ id, ...content }) => ({
      _id: id,
      ...content,
    }));
    if (version === 0) {
      try {
        return dto(
          await this.model.create({
            workspace: workspaceId,
            invoice: invoiceId,
            version: 1,
            entries: stored,
          }),
        );
      } catch (error: unknown) {
        if (error instanceof mongo.MongoServerError && error.code === 11000)
          return null;
        throw error;
      }
    }
    const row = await this.model
      .findOneAndUpdate(
        { workspace: workspaceId, invoice: invoiceId, version },
        { $set: { entries: stored }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .maxTimeMS(3000)
      .lean();
    return row ? dto(row) : null;
  }
}
