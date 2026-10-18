import { describe, it, expect } from 'vitest';
import { CryptoPortalSecrets } from '../src/modules/portal/infrastructure/portal-secrets.js';
import {
  visibleProgress,
  validatePortalVersion,
} from '../src/modules/portal/domain/client-portal.js';
describe('Portal capability and navigation boundaries', () => {
  const secrets = new CryptoPortalSecrets(),
    id = '1234567890abcdef12345678';
  it('uses unique random 256-bit tokens with deterministic stored digests', () => {
    const values = Array.from({ length: 50 }, () => secrets.generate());
    expect(new Set(values.map((value) => value.token)).size).toBe(50);
    for (const value of values) {
      expect(value.token).toHaveLength(43);
      expect(value.digest).toMatch(/^[a-f0-9]{64}$/u);
      expect(secrets.digest(value.token)).toBe(value.digest);
    }
  });
  it('encrypts resource IDs with independent randomized cursors bound to grant and kind', () => {
    const { digest } = secrets.generate(),
      cursor = secrets.encodeCursor(digest, 'projects', id);
    expect(cursor).toHaveLength(54);
    expect(cursor).not.toContain(id);
    expect(secrets.decodeCursor(digest, 'projects', cursor)).toBe(id);
    expect(secrets.encodeCursor(digest, 'projects', id)).not.toBe(cursor);
    expect(secrets.decodeCursor(digest, 'invoices', cursor)).toBeNull();
    expect(
      secrets.decodeCursor(secrets.generate().digest, 'projects', cursor),
    ).toBeNull();
  });
  it('rejects every altered encrypted cursor byte', () => {
    const { digest } = secrets.generate(),
      bytes = Buffer.from(
        secrets.encodeCursor(digest, 'projects', id),
        'base64url',
      );
    for (let i = 0; i < bytes.length; i++) {
      const altered = Buffer.from(bytes);
      altered[i] = altered[i]! ^ 1;
      expect(
        secrets.decodeCursor(digest, 'projects', altered.toString('base64url')),
      ).toBeNull();
    }
  });
  it.each(['', 'bad', 'A'.repeat(53), 'A'.repeat(55), '!'.repeat(54)])(
    'rejects malformed cursor %s',
    (cursor) =>
      expect(
        secrets.decodeCursor(secrets.generate().digest, 'projects', cursor),
      ).toBeNull(),
  );
  it('empty visible work has unknown progress and unfinished work never rounds to 100', () => {
    expect(visibleProgress([])).toEqual({
      total: 0,
      done: 0,
      percentage: null,
    });
    expect(
      visibleProgress(
        Array.from({ length: 200 }, (_, i) => ({
          status: i === 199 ? 'todo' : 'done',
        })),
      ),
    ).toEqual({ total: 200, done: 199, percentage: 99 });
    expect(visibleProgress([{ status: 'done' }])).toEqual({
      total: 1,
      done: 1,
      percentage: 100,
    });
  });
  it.each([0, 1, Number.MAX_SAFE_INTEGER - 1])(
    'accepts independent grant revision %s',
    (version) => expect(() => validatePortalVersion(version)).not.toThrow(),
  );
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    'rejects unsafe grant revision %s',
    (version) => expect(() => validatePortalVersion(version)).toThrow(),
  );
});
