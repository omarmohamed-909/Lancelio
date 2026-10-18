import { ApplicationError } from '../../../shared/domain/application-error.js';
import { parseAmountMinor } from '../../../shared/domain/money.js';
import type { Currency } from '../../../shared/domain/money.js';
export const paymentLimit = 200;
export const paymentMethods = [
  'bank_transfer',
  'cash',
  'wallet',
  'other',
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export interface PaymentInput {
  requestId: string;
  amount: string;
  paidOn: string;
  method: string;
  reference: string;
  memo: string;
}
export interface PaymentContent {
  amountMinor: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string;
  memo: string;
}
export interface Payment extends PaymentContent {
  id: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
}
export interface PaymentEntry extends Payment {
  requestId: string;
}
export interface StoredLedger {
  version: number;
  entries: PaymentEntry[];
}
export interface InvoiceBalanceReference {
  status: 'draft' | 'issued';
  currency: Currency;
  totalMinor: number;
}
export interface PaymentLedger {
  invoiceId: string;
  invoiceStatus: 'draft' | 'issued';
  currency: Currency;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  paymentStatus: 'not_issued' | 'unpaid' | 'partially_paid' | 'paid';
  version: number;
  payments: Payment[];
}
export function validateLedgerVersion(version: number) {
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version >= Number.MAX_SAFE_INTEGER
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid ledger version');
}
function boundedText(value: string, max: number, min = 0) {
  const text = value.trim();
  if (
    Array.from(text).length < min ||
    Array.from(text).length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid payment text');
  return text;
}
export function validateVoidReason(value: string) {
  return boundedText(value, 300, 2);
}
export function validatePayment(
  input: PaymentInput,
  currency: Currency,
  now: Date,
): PaymentContent {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      input.requestId,
    )
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'A UUIDv4 payment request id is required',
    );
  const amountMinor = parseAmountMinor(input.amount, currency);
  if (amountMinor <= 0)
    throw new ApplicationError('VALIDATION_ERROR', 'Payment must be positive');
  const date = new Date(input.paidOn + 'T00:00:00.000Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.paidOn) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input.paidOn ||
    input.paidOn < '1900-01-01' ||
    input.paidOn > now.toISOString().slice(0, 10)
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Choose a real payment date no later than today (UTC)',
    );
  if (!paymentMethods.includes(input.method as PaymentMethod))
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid payment method');
  return {
    amountMinor,
    paidOn: input.paidOn,
    method: input.method as PaymentMethod,
    reference: boundedText(input.reference, 100),
    memo: boundedText(input.memo, 500),
  };
}
export function samePayment(entry: PaymentEntry, content: PaymentContent) {
  return (
    entry.amountMinor === content.amountMinor &&
    entry.paidOn === content.paidOn &&
    entry.method === content.method &&
    entry.reference === content.reference &&
    entry.memo === content.memo
  );
}
export function ledgerView(
  invoiceId: string,
  invoice: InvoiceBalanceReference,
  ledger: StoredLedger | null,
): PaymentLedger {
  const entries = ledger?.entries ?? [];
  const paid = entries.reduce(
    (total, entry) => total + (entry.voidedAt ? 0n : BigInt(entry.amountMinor)),
    0n,
  );
  if (paid > BigInt(invoice.totalMinor))
    throw new Error('Payment ledger exceeds invoice total');
  const paidMinor = Number(paid),
    remainingMinor = invoice.totalMinor - paidMinor;
  return {
    invoiceId,
    invoiceStatus: invoice.status,
    currency: invoice.currency,
    totalMinor: invoice.totalMinor,
    paidMinor,
    remainingMinor,
    paymentStatus:
      invoice.status === 'draft'
        ? 'not_issued'
        : remainingMinor === 0
          ? 'paid'
          : paidMinor === 0
            ? 'unpaid'
            : 'partially_paid',
    version: ledger?.version ?? 0,
    payments: entries.map((entry) => ({
      id: entry.id,
      amountMinor: entry.amountMinor,
      paidOn: entry.paidOn,
      method: entry.method,
      reference: entry.reference,
      memo: entry.memo,
      createdAt: entry.createdAt,
      voidedAt: entry.voidedAt,
      voidReason: entry.voidReason,
    })),
  };
}
