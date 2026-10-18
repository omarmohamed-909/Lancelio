// All four currencies supported by this release have two decimal places.
const maximum = 100_000_000_000n;
export function parsePrice(value: string): bigint | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/u.exec(value.trim());
  if (!match?.[1]) return null;
  const result =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return result <= maximum ? result : null;
}
export function previewTotal(
  items: readonly { quantity: number; unitPrice: string }[],
): number | null {
  if (items.length === 0 || items.length > 50) return null;
  let total = 0n;
  for (const item of items) {
    const price = parsePrice(item.unitPrice);
    if (
      price === null ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10000
    )
      return null;
    total += price * BigInt(item.quantity);
    if (total > maximum) return null;
  }
  return Number(total);
}
export function decimalPrice(minor: number): string {
  const amount = BigInt(minor);
  return String(amount / 100n) + '.' + String(amount % 100n).padStart(2, '0');
}
export function formatMoney(
  minor: number,
  currency: string,
  locale = 'ar-EG',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
