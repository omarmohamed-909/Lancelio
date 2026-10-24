import { describe, expect, it } from 'vitest';
import {
  validateDetails as validateClientDetails,
  validateId,
  validateVersion,
} from '../src/modules/clients/domain/client.js';
import type { ClientDetails } from '../src/modules/clients/domain/client.js';
import { InternationalPhoneNumbers } from '../src/modules/clients/infrastructure/international-phone-numbers.js';
const phones = new InternationalPhoneNumbers();
const validateDetails = (input: ClientDetails) =>
  validateClientDetails(input, phones);
const details = {
  name: '  أحمد  ',
  email: '  CLIENT@Example.com ',
  phone: ' +20 (100) 555-1234 ',
  company: ' استوديو ',
  notes: ' ملاحظات ',
};
describe('Client domain validation', () => {
  it('normalizes optional fields and supports Arabic names', () => {
    expect(validateDetails(details)).toEqual({
      name: 'أحمد',
      email: 'client@example.com',
      phone: '+201005551234',
      company: 'استوديو',
      notes: 'ملاحظات',
    });
    expect(
      validateDetails({
        ...details,
        email: '',
        phone: '',
        company: '',
        notes: '',
      }).name,
    ).toBe('أحمد');
  });
  it.each([
    { name: ' ' },
    { name: 'a' },
    { name: 'a'.repeat(101) },
    { email: 'broken-address' },
    { email: 'a@-example.com' },
    { email: 'a@' + 'b'.repeat(250) + '.com' },
    { phone: 'abc' },
    { phone: '---' },
    { phone: '1'.repeat(41) },
    { company: 'أ'.repeat(121) },
    { notes: 'م'.repeat(2001) },
  ])('rejects invalid or oversized fields: %j', (invalid) => {
    expect(() => validateDetails({ ...details, ...invalid })).toThrow(
      'Invalid client details',
    );
  });
  it('counts Unicode code points rather than UTF-16 units', () => {
    expect(
      validateDetails({ ...details, name: '😀'.repeat(100) }).name,
    ).toHaveLength(200);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN])(
    'rejects invalid concurrency versions %s',
    (version) => {
      expect(() => validateVersion(version)).toThrow('Invalid version');
    },
  );
  it('normalizes identifiers and rejects malformed tenant scope', () => {
    expect(validateId('ABCDEF123456ABCDEF123456')).toBe(
      'abcdef123456abcdef123456',
    );
    expect(() => validateId('foreign-workspace')).toThrow('Invalid identifier');
  });
});

import { validateClientList } from '../src/modules/clients/domain/client-list.js';
describe('Bounded client search criteria', () => {
  it('trims literal search and defaults contact filtering', () => {
    expect(validateClientList({ archived: false, search: '  سارة  ' })).toEqual(
      { archived: false, search: 'سارة', contact: 'all', order: 'newest' },
    );
    expect(validateClientList({ archived: true })).toEqual({
      archived: true,
      search: '',
      contact: 'all',
      order: 'newest',
    });
  });
  it('counts search length in Unicode code points', () => {
    expect(
      validateClientList({ archived: false, search: '😀'.repeat(100) }).search,
    ).toHaveLength(200);
    expect(() =>
      validateClientList({ archived: false, search: '😀'.repeat(101) }),
    ).toThrow('Invalid client search filters');
  });
  it.each(['a'.repeat(101), 'a\u0000b', 'a\nb', 'a\tb', 'a\u007fb'])(
    'rejects oversized or control-character queries %j',
    (search) => {
      expect(() => validateClientList({ archived: false, search })).toThrow(
        'Invalid client search filters',
      );
    },
  );
  it('retains regex punctuation as literal user text', () => {
    expect(
      validateClientList({ archived: false, search: '(a+)+$.*[x]\\' }).search,
    ).toBe('(a+)+$.*[x]\\');
  });
  it('validates and normalizes the pagination cursor', () => {
    expect(
      validateClientList({
        archived: false,
        cursor: 'ABCDEF123456ABCDEF123456',
      }).cursor,
    ).toBe('abcdef123456abcdef123456');
    expect(() =>
      validateClientList({ archived: false, cursor: 'bad' }),
    ).toThrow('Invalid identifier');
  });
});
