import type { PublicGrant } from '../../../shared/domain/public-grant.js';
import type { Currency } from '../../../shared/domain/money.js';
import type { PricedItem } from '../../../shared/domain/priced-items.js';
export type InvoiceGrant = PublicGrant;
export interface NewInvoiceGrant extends PublicGrant {
  digest: string;
}
export interface InvoiceShareState {
  invoiceVersion: number;
  invoiceStatus: 'draft' | 'issued';
  updatedAt: Date;
  share: (PublicGrant & { state: 'active' | 'expired' | 'revoked' }) | null;
}
export interface PublicInvoice {
  number: string;
  title: string;
  summary: string;
  terms: string;
  currency: Currency;
  items: PricedItem[];
  totalMinor: number;
  status: 'issued';
  client: { name: string; company: string };
  senderName: string;
  issuedAt: Date;
  expiresAt: Date;
}
