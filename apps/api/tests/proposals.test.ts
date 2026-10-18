import { describe, expect, it } from 'vitest';
import {
  parseAmountMinor,
  validateCurrency,
  maximumAmountMinor,
} from '../src/shared/domain/money.js';
import { validateDraft } from '../src/modules/proposals/domain/proposal.js';
const draft = {
  clientId: 'abcdef123456abcdef123456',
  title: '  تصميم موقع  ',
  summary: ' نطاق العمل ',
  terms: ' الشروط ',
  currency: 'EGP',
  items: [
    { title: ' الصفحة الأولى ', quantity: 3, unitPrice: '0.10' },
    { title: 'اختبار الموقع', quantity: 1, unitPrice: '0.20' },
  ],
};
describe('Exact proposal money and draft invariants', () => {
  it('computes totals exactly, normalizes text, and ignores no precision', () => {
    const result = validateDraft(draft);
    expect(result.totalMinor).toBe(50);
    expect(result.items.map((item) => item.totalMinor)).toEqual([30, 20]);
    expect(result.title).toBe('تصميم موقع');
    expect(result.items[0]?.title).toBe('الصفحة الأولى');
    expect(result.itemCount).toBe(2);
  });
  it.each([
    ['0', 0],
    ['0.1', 10],
    ['001.25', 125],
    ['123456.78', 12345678],
    [' 2.50 ', 250],
    ['1000000000.00', maximumAmountMinor],
  ])('parses %s without floating-point multiplication', (amount, minor) => {
    expect(parseAmountMinor(String(amount), 'EGP')).toBe(minor);
  });
  it.each([
    '-1',
    '+1',
    '1e3',
    'NaN',
    'Infinity',
    '.5',
    '1.',
    '1,50',
    '1.005',
    '0.000',
    '1000000000.01',
    '99999999999',
    '',
  ])('rejects ambiguous, over-precision or oversized price %j', (amount) => {
    expect(() => parseAmountMinor(amount, 'USD')).toThrow();
  });
  it.each(['EGP', 'USD', 'EUR', 'SAR'])(
    'supports the configured currency %s',
    (currency) => {
      expect(validateCurrency(currency)).toBe(currency);
    },
  );
  it.each(['JPY', 'usd', 'constructor', '__proto__', ''])(
    'rejects unsupported currencies %j',
    (currency) => {
      expect(() => validateCurrency(currency)).toThrow('Unsupported currency');
    },
  );
  it.each([
    { title: ' ' },
    { title: 'x'.repeat(121) },
    { summary: 'x'.repeat(3001) },
    { terms: 'x'.repeat(2001) },
    { items: [] },
    {
      items: Array.from(
        { length: 51 },
        () => draft.items[0] ?? { title: '', quantity: 0, unitPrice: '' },
      ),
    },
  ])('rejects invalid draft fields %j', (invalid) => {
    expect(() => validateDraft({ ...draft, ...invalid })).toThrow(
      'Invalid proposal details',
    );
  });
  it.each([0, -1, 1.5, 10001, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid quantities %s',
    (quantity) => {
      expect(() =>
        validateDraft({
          ...draft,
          items: [{ title: 'بند العمل', quantity, unitPrice: '1.00' }],
        }),
      ).toThrow('Invalid deliverable');
    },
  );
  it('rejects line multiplication and aggregate overflow before returning unsafe numbers', () => {
    expect(() =>
      validateDraft({
        ...draft,
        items: [{ title: 'بند العمل', quantity: 2, unitPrice: '1000000000' }],
      }),
    ).toThrow('Proposal total exceeds');
    expect(() =>
      validateDraft({
        ...draft,
        items: [
          { title: 'بند العمل', quantity: 1, unitPrice: '1000000000' },
          { title: 'بند آخر', quantity: 1, unitPrice: '0.01' },
        ],
      }),
    ).toThrow('Proposal total exceeds');
  });
  it('allows explicitly free deliverables without inventing tax or discount amounts', () => {
    expect(
      validateDraft({
        ...draft,
        items: [{ title: 'استشارة مجانية', quantity: 1, unitPrice: '0' }],
      }).totalMinor,
    ).toBe(0);
  });
});
