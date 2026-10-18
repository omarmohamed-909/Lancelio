import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import type { PortalSecrets } from '../application/ports/portal-store.js';
export class CryptoPortalSecrets implements PortalSecrets {
  generate() {
    const token = randomBytes(32).toString('base64url');
    return { token, digest: this.digest(token) };
  }
  digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  encodeCursor(digest: string, kind: 'projects' | 'invoices', id: string) {
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(digest, 'hex'), nonce);
    cipher.setAAD(Buffer.from(kind));
    const data = Buffer.concat([
      cipher.update(Buffer.from(id, 'hex')),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString(
      'base64url',
    );
  }
  decodeCursor(digest: string, kind: 'projects' | 'invoices', cursor: string) {
    if (!/^[A-Za-z0-9_-]{54}$/u.test(cursor)) return null;
    try {
      const bytes = Buffer.from(cursor, 'base64url');
      if (bytes.length !== 40 || bytes.toString('base64url') !== cursor)
        return null;
      const cipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(digest, 'hex'),
        bytes.subarray(0, 12),
      );
      cipher.setAAD(Buffer.from(kind));
      cipher.setAuthTag(bytes.subarray(12, 28));
      const id = Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString('hex');
      return /^[a-f0-9]{24}$/u.test(id) ? id : null;
    } catch {
      return null;
    }
  }
}
