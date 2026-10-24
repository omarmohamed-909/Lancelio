import { describe, expect, it } from 'vitest';
import { InternationalPhoneNumbers } from '../apps/api/src/modules/clients/infrastructure/international-phone-numbers.js';
import {
  normalizeInternationalPhone,
  phoneDraft,
  phoneEditorValue,
} from '../apps/web/src/features/clients/services/phone-number.js';
const phones = new InternationalPhoneNumbers();
describe('Country-aware client phone validation', () => {
  it.each([
    ['EG', '01012345678', '+201012345678'],
    ['SA', '0551234567', '+966551234567'],
    ['AE', '0501234567', '+971501234567'],
    ['US', '(202) 555-0123', '+12025550123'],
    ['CA', '(416) 555-0123', '+14165550123'],
    ['GB', '020 7946 0018', '+442079460018'],
    ['FR', '06 12 34 56 78', '+33612345678'],
    ['DE', '030 123456', '+4930123456'],
    ['IN', '9876543210', '+919876543210'],
    ['JP', '09012345678', '+819012345678'],
    ['BR', '11912345678', '+5511912345678'],
    ['AU', '0412345678', '+61412345678'],
    ['ZA', '0821234567', '+27821234567'],
    ['NZ', '0211234567', '+64211234567'],
  ] as const)(
    'validates and normalizes %s national and international input',
    (country, national, international) => {
      expect(phoneDraft(national, country)).toBe(international);
      expect(phones.normalize(international)).toBe(international);
      expect(normalizeInternationalPhone(international)).toBe(international);
      expect(phoneEditorValue(international).country).toBe(country);
    },
  );
  it.each([
    '123',
    '999999999999999',
    '+999123456789',
    '+201912345678',
    '+201012345',
    '+96612345',
    '+11111111111',
    '+442079460018 ext 123',
    'call +442079460018',
    '+442079460018<script>',
    '+442079460018\nspam',
    '++442079460018',
    '+44+2079460018',
    '+442079460018'.repeat(4),
    '01012345678',
    '(202) 555-0123',
    '+',
    '---',
  ])(
    'rejects malformed, unallocated-prefix, ambiguous or incomplete input %j',
    (value) => {
      expect(phones.normalize(value)).toBeNull();
      expect(normalizeInternationalPhone(value)).toBeNull();
    },
  );
  it.each([
    ['+٢٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
    ['٠٠٩٦٦٥٥١٢٣٤٥٦٧', '+966551234567'],
    ['+۹۸۹۱۲۳۴۵۶۷۸۹', '+989123456789'],
    [' +44 (20) 7946-0018 ', '+442079460018'],
    ['', ''],
    ['  ', ''],
  ])(
    'supports localized digits and presentation formatting %j',
    (raw, expected) => {
      expect(phones.normalize(raw!)).toBe(expected);
      expect(normalizeInternationalPhone(raw!)).toBe(expected);
    },
  );
  it('does not accept a number belonging to a different region sharing the same calling code', () => {
    expect(
      normalizeInternationalPhone(phoneDraft('2025550123', 'CA')),
    ).toBeNull();
    expect(
      normalizeInternationalPhone(phoneDraft('4165550123', 'US')),
    ).toBeNull();
    expect(phoneDraft('٠٥٥١٢٣٤٥٦٧', 'SA')).toBe('+966551234567');
  });
});
