import { createHash, randomBytes } from 'node:crypto';
export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export class CryptoGrantTokens {
  digest(token: string) {
    return sha256(token);
  }
  generate() {
    const token = randomBytes(32).toString('base64url');
    return { token, digest: this.digest(token) };
  }
}
