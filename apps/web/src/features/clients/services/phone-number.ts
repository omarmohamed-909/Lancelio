import {
  parsePhoneNumberFromString,
  getCountryCallingCode,
} from 'libphonenumber-js/max';
import type { CountryCode } from 'libphonenumber-js';
export function phoneCharacters(value: string) {
  return value
    .trim()
    .replace(/[٠-٩۰-۹]/gu, (digit) =>
      String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)),
    )
    .replace(/^00/u, '+');
}
export function normalizeInternationalPhone(input: string): string | null {
  if (input.length > 40) return null;
  const value = phoneCharacters(input);
  if (!value) return '';
  if (!/^\+[0-9() .-]+$/u.test(value)) return null;
  const phone = parsePhoneNumberFromString(value, { extract: false });
  return phone?.isValid() && !phone.ext ? phone.number : null;
}
export function phoneDraft(input: string, country: CountryCode | '') {
  const value = phoneCharacters(input);
  if (!value) return '';
  if (!/^\+?[0-9() .-]+$/u.test(value)) return input;
  const parsed = parsePhoneNumberFromString(value, {
    extract: false,
    ...(country ? { defaultCountry: country } : {}),
  });
  if (parsed) {
    if (
      !value.startsWith('+') &&
      country &&
      parsed.country &&
      parsed.country !== country
    )
      return value;
    return parsed.number;
  }
  return country && !value.startsWith('+')
    ? '+' + getCountryCallingCode(country) + value
    : value;
}
export function phoneEditorValue(value: string) {
  const parsed = parsePhoneNumberFromString(phoneCharacters(value), {
    extract: false,
  });
  return {
    country: parsed?.country ?? ('' as CountryCode | ''),
    input:
      parsed?.isValid() && parsed.country ? parsed.formatNational() : value,
  };
}
