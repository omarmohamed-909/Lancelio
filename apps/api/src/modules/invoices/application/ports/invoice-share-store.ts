import type { Invoice } from '../../domain/invoice.js';
import type {
  InvoiceGrant,
  NewInvoiceGrant,
  PublicInvoice,
} from '../../domain/invoice-share.js';
export interface SharedInvoiceRecord {
  invoice: Invoice;
  grant: InvoiceGrant | null;
}
export interface InvoiceShareStore {
  find(workspaceId: string, id: string): Promise<SharedInvoiceRecord | null>;
  issue(
    workspaceId: string,
    id: string,
    version: number,
    grant: NewInvoiceGrant,
  ): Promise<SharedInvoiceRecord | null>;
  revoke(
    workspaceId: string,
    id: string,
    version: number,
    now: Date,
  ): Promise<SharedInvoiceRecord | null>;
  findPublic(digest: string, now: Date): Promise<PublicInvoice | null>;
}
export interface InvoiceShareTokens {
  generate(): { token: string; digest: string };
  digest(token: string): string;
}
