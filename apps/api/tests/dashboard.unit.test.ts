import { describe, it, expect } from 'vitest';
import { exactMinor } from '../src/modules/dashboard/domain/exact-minor.js';
describe('Exact Decimal128 integer minor units', () => {
  it.each([
    ['0', '0'],
    ['100.00', '100'],
    ['9.007300000000000E+15', '9007300000000000'],
    ['1.0000E+2', '100'],
    ['100E-2', '1'],
    ['0001', '1'],
  ])('normalizes %s without rounding', (value, expected) =>
    expect(exactMinor(value)).toBe(expected),
  );
  it.each([
    '-1',
    'NaN',
    'Infinity',
    '1.1',
    '1E-1',
    '1E+999',
    '1E+34',
    'secret',
    '',
  ])('rejects invalid or fractional aggregate %s', (value) =>
    expect(() => exactMinor(value)).toThrow(),
  );
});
