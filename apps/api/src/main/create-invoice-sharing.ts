import type { InvoiceModels } from '../modules/invoices/infrastructure/invoice-model.js';
import { ShareInvoices } from '../modules/invoices/application/share-invoices.js';
import { MongoInvoiceShareStore } from '../modules/invoices/infrastructure/mongo-invoice-share-store.js';
import { CryptoGrantTokens } from '../shared/infrastructure/crypto-grant-tokens.js';
export function createInvoiceSharing(models: InvoiceModels, now?: () => Date) {
  return new ShareInvoices(
    new MongoInvoiceShareStore(models.Invoice),
    new CryptoGrantTokens(),
    now,
  );
}
