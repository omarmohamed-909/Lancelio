import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { RecoverySecrets } from '../application/ports/password-recovery.js';
export class EncryptedRecoverySecrets implements RecoverySecrets {
  private readonly key: Buffer;
  constructor(secret: string) {
    this.key = createHmac('sha256', secret)
      .update('lancelio:password-recovery:v1')
      .digest();
  }
  create(email: string) {
    const token = randomBytes(32).toString('base64url');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify({ email, token }), 'utf8'),
      cipher.final(),
    ]);
    return {
      id: this.digest(token)!,
      mailbox: createHmac('sha256', this.key).update(email).digest('hex'),
      payload: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
        'base64url',
      ),
    };
  }
  open(payload: string) {
    const bytes = Buffer.from(payload, 'base64url');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      bytes.subarray(0, 12),
    );
    cipher.setAuthTag(bytes.subarray(12, 28));
    const value: unknown = JSON.parse(
      Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString('utf8'),
    );
    if (
      typeof value !== 'object' ||
      value === null ||
      !('email' in value) ||
      !('token' in value) ||
      typeof value.email !== 'string' ||
      typeof value.token !== 'string'
    )
      throw new Error('Invalid recovery payload');
    return { email: value.email, token: value.token };
  }
  digest(token: string) {
    return /^[A-Za-z0-9_-]{43}$/u.test(token)
      ? createHash('sha256').update(token).digest('hex')
      : null;
  }
  lease() {
    return randomUUID();
  }
}
