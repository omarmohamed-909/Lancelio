import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { ClientPhoneNumbers } from '../domain/client.js';
export class InternationalPhoneNumbers implements ClientPhoneNumbers {
  normalize(input: string): string | null {
    if (input.length > 40) return null;
    const value = input
      .trim()
      .replace(/[٠-٩۰-۹]/gu, (digit) =>
        String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)),
      )
      .replace(/^00/u, '+');
    if (!value) return '';
    if (!/^\+[0-9() .-]+$/u.test(value)) return null;
    const phone = parsePhoneNumberFromString(value, { extract: false });
    return phone?.isValid() && !phone.ext ? phone.number : null;
  }
}
