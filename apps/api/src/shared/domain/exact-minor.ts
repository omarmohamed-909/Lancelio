// Decimal128 may serialize integer minor units with a decimal scale or exponent.
export function exactMinor(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?(?:E([+-]?\d+))?$/iu.exec(value);
  if (!match?.[1]) throw new Error('Invalid overview amount');
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 34)
    throw new Error('Invalid overview exponent');
  const digits = match[1] + fraction;
  const shift = exponent - fraction.length;
  let integer: string;
  if (shift >= 0) integer = digits + '0'.repeat(shift);
  else {
    const cut = digits.length + shift;
    if (cut < 0 || !/^0*$/u.test(digits.slice(cut)))
      throw new Error('Fractional overview minor');
    integer = digits.slice(0, cut) || '0';
  }
  if (integer.length > 34) throw new Error('Overview amount exceeds precision');
  return String(BigInt(integer));
}
