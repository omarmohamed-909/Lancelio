import { describe, it, expect } from 'vitest';
import {
  validatePayment,
  ledgerView,
  validateVoidReason,
  validateLedgerVersion,
} from '../src/modules/payments/domain/payment-ledger.js';
import type {
  PaymentInput,
  PaymentEntry,
} from '../src/modules/payments/domain/payment-ledger.js';
const now = new Date('2026-10-09T12:00:00Z');
const input: PaymentInput = {
  requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  amount: '1.25',
  paidOn: '2026-10-09',
  method: 'bank_transfer',
  reference: ' bank ',
  memo: ' memo ',
};
describe('Payment money, dates and derived balances', () => {
  it('normalizes positive minor units without rounding', () => {
    expect(validatePayment(input, 'EGP', now)).toEqual({
      amountMinor: 125,
      paidOn: input.paidOn,
      method: input.method,
      reference: 'bank',
      memo: 'memo',
    });
  });
  it.each([
    '0',
    '0.00',
    '-1',
    '1.001',
    '1e2',
    'NaN',
    '',
    '1000000001',
    '+2',
    '1,25',
  ])('rejects invalid amount %s', (amount) =>
    expect(() => validatePayment({ ...input, amount }, 'USD', now)).toThrow(),
  );
  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-04-31',
    '2026-10-10',
    '1899-12-31',
    '2026-1-01',
    'today',
  ])('rejects invalid/future date %s', (paidOn) =>
    expect(() => validatePayment({ ...input, paidOn }, 'EGP', now)).toThrow(),
  );
  it('accepts leap days and exact maximum money', () =>
    expect(
      validatePayment(
        { ...input, paidOn: '2024-02-29', amount: '1000000000.00' },
        'SAR',
        now,
      ).amountMinor,
    ).toBe(100_000_000_000));
  it('checks method, UUID and Unicode text lengths', () => {
    for (const overrides of [
      { method: 'card' },
      { requestId: '123' },
      { reference: '😀'.repeat(101) },
      { memo: 'a'.repeat(501) },
      { memo: 'bad' + String.fromCharCode(0) },
    ])
      expect(() =>
        validatePayment({ ...input, ...overrides }, 'EUR', now),
      ).toThrow();
    expect(
      validatePayment({ ...input, reference: '😀'.repeat(100) }, 'EUR', now)
        .reference,
    ).toHaveLength(200);
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, NaN])(
    'rejects invalid revision %s',
    (version) => expect(() => validateLedgerVersion(version)).toThrow(),
  );
  it('requires bounded correction reason', () => {
    expect(validateVoidReason(' mistaken entry ')).toBe('mistaken entry');
    for (const reason of ['', 'x', 'a'.repeat(301)])
      expect(() => validateVoidReason(reason)).toThrow();
  });
  it('derives exact balances, omits creation keys and excludes voided entries', () => {
    const entry: PaymentEntry = {
      ...validatePayment(input, 'EGP', now),
      id: 'a'.repeat(24),
      requestId: input.requestId,
      createdAt: now,
      voidedAt: null,
      voidReason: null,
    };
    const ledger = {
      version: 3,
      entries: [
        entry,
        {
          ...entry,
          id: 'b'.repeat(24),
          amountMinor: 250,
          voidedAt: now,
          voidReason: 'wrong',
        },
      ],
    };
    const view = ledgerView(
      'c'.repeat(24),
      { status: 'issued', currency: 'EGP', totalMinor: 500 },
      ledger,
    );
    expect(view).toMatchObject({
      paidMinor: 125,
      remainingMinor: 375,
      paymentStatus: 'partially_paid',
    });
    expect(JSON.stringify(view)).not.toContain('requestId');
    expect(
      ledgerView(
        'c'.repeat(24),
        { status: 'issued', currency: 'EGP', totalMinor: 125 },
        { version: 1, entries: [entry] },
      ).paymentStatus,
    ).toBe('paid');
  });
  it('distinguishes zero issued and zero drafts', () => {
    expect(
      ledgerView(
        'a'.repeat(24),
        { status: 'issued', currency: 'USD', totalMinor: 0 },
        null,
      ).paymentStatus,
    ).toBe('paid');
    expect(
      ledgerView(
        'a'.repeat(24),
        { status: 'draft', currency: 'USD', totalMinor: 0 },
        null,
      ).paymentStatus,
    ).toBe('not_issued');
  });
});
