import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
import { validateCurrency } from '../../../shared/domain/money.js';
import type { Currency } from '../../../shared/domain/money.js';
import { priceItems } from '../../../shared/domain/priced-items.js';
import type {
  PriceInput,
  PricedItem,
} from '../../../shared/domain/priced-items.js';
export interface InvoiceInput {
  requestId: string;
  clientId: string;
  projectId: string | null;
  title: string;
  summary: string;
  terms: string;
  currency: string;
  items: PriceInput[];
}
export interface InvoiceContent {
  clientId: string;
  projectId: string | null;
  title: string;
  summary: string;
  terms: string;
  currency: Currency;
  items: PricedItem[];
  itemCount: number;
  totalMinor: number;
}
export interface InvoiceClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
}
export interface InvoiceProject {
  id: string;
  title: string;
  clientId: string;
}
export interface InvoiceSummary {
  id: string;
  number: string;
  sequence: number;
  title: string;
  client: InvoiceClient;
  project: InvoiceProject | null;
  status: 'draft' | 'issued';
  issuedAt: Date | null;
  senderName: string | null;
  currency: Currency;
  totalMinor: number;
  itemCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface Invoice extends InvoiceSummary {
  summary: string;
  terms: string;
  items: PricedItem[];
}
export interface InvoicePage {
  items: InvoiceSummary[];
  nextCursor: string | null;
}
export function validateInvoice(input: InvoiceInput): InvoiceContent {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      input.requestId,
    )
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'A UUIDv4 request id is required',
    );
  return validateInvoiceContent(input);
}
export function validateInvoiceContent(
  input: Omit<InvoiceInput, 'requestId'>,
): InvoiceContent {
  const clientId = validateId(input.clientId),
    projectId = input.projectId === null ? null : validateId(input.projectId);
  const title = input.title.trim(),
    summary = input.summary.trim(),
    terms = input.terms.trim();
  if (
    Array.from(title).length < 2 ||
    Array.from(title).length > 120 ||
    Array.from(summary).length > 3000 ||
    Array.from(terms).length > 2000
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid invoice details');
  const currency = validateCurrency(input.currency);
  return {
    clientId,
    projectId,
    title,
    summary,
    terms,
    currency,
    ...priceItems(input.items, currency),
  };
}
export function sameInvoiceContent(invoice: Invoice, content: InvoiceContent) {
  return (
    invoice.client.id === content.clientId &&
    (invoice.project?.id ?? null) === content.projectId &&
    invoice.title === content.title &&
    invoice.summary === content.summary &&
    invoice.terms === content.terms &&
    invoice.currency === content.currency &&
    invoice.items.length === content.items.length &&
    invoice.items.every((item, index) => {
      const other = content.items[index];
      return (
        !!other &&
        item.title === other.title &&
        item.quantity === other.quantity &&
        item.unitPriceMinor === other.unitPriceMinor &&
        item.totalMinor === other.totalMinor
      );
    })
  );
}
export function invoiceNumber(sequence: number) {
  return 'INV-' + String(sequence).padStart(6, '0');
}

export function invoiceContent(invoice: Invoice): InvoiceContent {
  return {
    clientId: invoice.client.id,
    projectId: invoice.project?.id ?? null,
    title: invoice.title,
    summary: invoice.summary,
    terms: invoice.terms,
    currency: invoice.currency,
    items: invoice.items,
    itemCount: invoice.itemCount,
    totalMinor: invoice.totalMinor,
  };
}
export function creationIdentity(content: InvoiceContent) {
  return JSON.stringify([
    content.clientId,
    content.projectId,
    content.title,
    content.summary,
    content.terms,
    content.currency,
    content.items.map((item) => [
      item.title,
      item.quantity,
      item.unitPriceMinor,
    ]),
  ]);
}
