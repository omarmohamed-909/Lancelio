import { Types } from 'mongoose';
import type { InvoiceModels } from '../modules/invoices/infrastructure/invoice-model.js';
import type { PaymentLedgerModel } from '../modules/payments/infrastructure/payment-ledger-model.js';
import { ManagePayments } from '../modules/payments/application/manage-payments.js';
import { MongoPaymentStore } from '../modules/payments/infrastructure/mongo-payment-store.js';
import { validateCurrency } from '../shared/domain/money.js';
export function createPayments(
  model: PaymentLedgerModel,
  invoices: InvoiceModels['Invoice'],
  now: () => Date = () => new Date(),
) {
  return new ManagePayments(
    new MongoPaymentStore(model),
    {
      find: async (workspaceId, invoiceId) => {
        const invoice = await invoices
          .findOne({ workspace: workspaceId, _id: invoiceId })
          .select('status currency totalMinor')
          .maxTimeMS(3000)
          .lean();
        return invoice
          ? {
              status: invoice.status,
              currency: validateCurrency(invoice.currency),
              totalMinor: invoice.totalMinor,
            }
          : null;
      },
    },
    () => new Types.ObjectId().toString(),
    now,
  );
}
