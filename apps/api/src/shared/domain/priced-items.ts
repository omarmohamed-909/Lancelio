import { ApplicationError } from './application-error.js';
import { maximumAmountMinor, parseAmountMinor } from './money.js';
import type { Currency } from './money.js';
export interface PriceInput {
  title: string;
  quantity: number;
  unitPrice: string;
}
export interface PricedItem {
  title: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}
export function priceItems(
  input: readonly PriceInput[],
  currency: Currency,
  messages = {
    invalidItem: 'Invalid item',
    overflow: 'Total exceeds the supported limit',
  },
) {
  if (input.length < 1 || input.length > 50)
    throw new ApplicationError('VALIDATION_ERROR', 'Include 1–50 items');
  let total = 0n;
  const items = input.map((item) => {
    const title = item.title.trim();
    if (
      Array.from(title).length < 2 ||
      Array.from(title).length > 120 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10000
    )
      throw new ApplicationError('VALIDATION_ERROR', messages.invalidItem);
    const unitPriceMinor = parseAmountMinor(item.unitPrice, currency);
    const line = BigInt(unitPriceMinor) * BigInt(item.quantity);
    total += line;
    if (total > BigInt(maximumAmountMinor))
      throw new ApplicationError('VALIDATION_ERROR', messages.overflow);
    return {
      title,
      quantity: item.quantity,
      unitPriceMinor,
      totalMinor: Number(line),
    };
  });
  return { items, itemCount: items.length, totalMinor: Number(total) };
}
