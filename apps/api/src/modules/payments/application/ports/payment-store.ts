import type {
  InvoiceBalanceReference,
  PaymentEntry,
  StoredLedger,
} from '../../domain/payment-ledger.js';
export interface PaymentStore {
  find(workspaceId: string, invoiceId: string): Promise<StoredLedger | null>;
  save(
    workspaceId: string,
    invoiceId: string,
    version: number,
    entries: PaymentEntry[],
  ): Promise<StoredLedger | null>;
}
export interface PaymentInvoiceDirectory {
  find(
    workspaceId: string,
    invoiceId: string,
  ): Promise<InvoiceBalanceReference | null>;
}
