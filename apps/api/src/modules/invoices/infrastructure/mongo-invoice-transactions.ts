import type { ClientSession, Connection } from 'mongoose';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type {
  InvoiceContext,
  InvoiceReferences,
  InvoiceTransactions,
} from '../application/ports/invoice-store.js';
import type { InvoiceModels } from './invoice-model.js';
import { MongoInvoiceStore } from './mongo-invoice-store.js';
export class MongoInvoiceTransactions implements InvoiceTransactions {
  constructor(
    private readonly database: Connection,
    private readonly models: InvoiceModels,
    private readonly references: (session: ClientSession) => InvoiceReferences,
  ) {}
  async execute<T>(
    workspaceId: string,
    action: (context: InvoiceContext) => Promise<T>,
  ): Promise<T> {
    // Provision the zero counter outside the transaction; only the increment commits with the invoice.
    try {
      await this.models.Counter.updateOne(
        { _id: workspaceId },
        { $setOnInsert: { sequence: 0 } },
        { upsert: true },
      );
    } catch (cause: unknown) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 11000))
        throw cause;
    }
    return this.database.transaction((session) =>
      action({
        invoices: new MongoInvoiceStore(this.models.Invoice, session),
        references: this.references(session),
        nextNumber: async () => {
          const row = await this.models.Counter.findOneAndUpdate(
            { _id: workspaceId, sequence: { $lt: Number.MAX_SAFE_INTEGER } },
            { $inc: { sequence: 1 } },
            { session, returnDocument: 'after' },
          ).lean();
          if (!row)
            throw new ApplicationError(
              'INVOICE_NUMBER_EXHAUSTED',
              'Invoice numbering limit reached',
            );
          return row.sequence;
        },
      }),
    );
  }
}
