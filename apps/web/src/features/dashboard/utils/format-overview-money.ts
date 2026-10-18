// Format arbitrary-size integer minor units without rounding through Number.
export function formatOverviewMoney(
  minor: string,
  currency: string,
  locale = 'ar-EG',
) {
  const value = BigInt(minor);
  const fraction = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(Number(value % 100n));
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(value / 100n)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}
