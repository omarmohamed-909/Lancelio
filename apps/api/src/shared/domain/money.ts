import { ApplicationError } from './application-error.js';
export const currencyPrecision = { EGP: 2, USD: 2, EUR: 2, SAR: 2 } as const;
export type Currency = keyof typeof currencyPrecision;
export const maximumAmountMinor = 100_000_000_000;
export function validateCurrency(value: string): Currency {
  if (!Object.prototype.hasOwnProperty.call(currencyPrecision, value))
    throw new ApplicationError('VALIDATION_ERROR', 'Unsupported currency', {
      currency: 'Choose a supported currency',
    });
  return value as Currency;
}
export function parseAmountMinor(value: string, currency: Currency): number {
  const amount = value.trim();
  const precision = currencyPrecision[currency];
  const match = /^(\d{1,10})(?:\.(\d+))?$/u.exec(amount);
  if (!match || (match[2]?.length ?? 0) > precision)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid unit price');
  const minor =
    BigInt(match[1] ?? '0') * 10n ** BigInt(precision) +
    BigInt((match[2] ?? '').padEnd(precision, '0') || '0');
  if (minor > BigInt(maximumAmountMinor))
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Amount exceeds the supported limit',
    );
  return Number(minor);
}
