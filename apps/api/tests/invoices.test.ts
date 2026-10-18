import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  validateInvoice,
  invoiceNumber,
} from '../src/modules/invoices/domain/invoice.js';
const input = {
  requestId: randomUUID(),
  clientId: 'abcdef123456abcdef123456',
  projectId: null,
  title: ' فاتورة موقع ',
  summary: ' النطاق ',
  terms: ' الشروط ',
  currency: 'EGP',
  items: [
    { title: ' تصميم ', quantity: 3, unitPrice: '0.10' },
    { title: ' مراجعة ', quantity: 1, unitPrice: '0.20' },
  ],
};
describe('Invoice creation domain invariants', () => {
  it.each(['EGP', 'USD', 'EUR', 'SAR'])(
    'calculates exact minor-unit totals for %s',
    (currency) => {
      const result = validateInvoice({ ...input, currency });
      expect(result.totalMinor).toBe(50);
      expect(result.items.map((item) => item.totalMinor)).toEqual([30, 20]);
      expect(result.title).toBe('فاتورة موقع');
    },
  );
  it.each([
    '1.005',
    '0.000',
    '-1',
    '+1',
    '1e3',
    'NaN',
    'Infinity',
    '.5',
    '1.',
    '1,50',
    '1000000000.01',
    '99999999999',
    '',
  ])('rejects price %j without rounding', (unitPrice) =>
    expect(() =>
      validateInvoice({
        ...input,
        items: [{ title: 'تصميم', quantity: 1, unitPrice }],
      }),
    ).toThrow(),
  );
  it.each([0, -1, 1.5, 10001, Infinity, NaN])(
    'rejects quantity %j',
    (quantity) =>
      expect(() =>
        validateInvoice({
          ...input,
          items: [{ title: 'تصميم', quantity, unitPrice: '1' }],
        }),
      ).toThrow(),
  );
  it.each([
    { title: ' ' },
    { title: 'x'.repeat(121) },
    { summary: 'x'.repeat(3001) },
    { terms: 'x'.repeat(2001) },
    { clientId: 'bad' },
    { projectId: 'bad' },
    { requestId: 'bad' },
    { requestId: '00000000-0000-0000-0000-000000000000' },
    { currency: 'JPY' },
    { currency: '__proto__' },
    { items: [] },
    { items: Array.from({ length: 51 }, () => input.items[0]!) },
  ])('rejects invalid content %j', (override) =>
    expect(() => validateInvoice({ ...input, ...override })).toThrow(),
  );
  it('rejects overflow in multiplication and addition', () => {
    expect(() =>
      validateInvoice({
        ...input,
        items: [{ title: 'شغل', quantity: 2, unitPrice: '1000000000' }],
      }),
    ).toThrow();
    expect(() =>
      validateInvoice({
        ...input,
        items: [
          { title: 'شغل', quantity: 1, unitPrice: '1000000000' },
          { title: 'إضافة', quantity: 1, unitPrice: '0.01' },
        ],
      }),
    ).toThrow();
  });
  it('accepts the exact cap and a zero-cost line', () => {
    expect(
      validateInvoice({
        ...input,
        items: [
          { title: 'شغل', quantity: 10000, unitPrice: '100000' },
          { title: 'إضافة', quantity: 1, unitPrice: '0.00' },
        ],
      }).totalMinor,
    ).toBe(100000000000);
  });
  it('formats numbers without resetting or truncating larger sequences', () => {
    expect(invoiceNumber(1)).toBe('INV-000001');
    expect(invoiceNumber(1000000)).toBe('INV-1000000');
  });
});
