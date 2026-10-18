import { randomBytes } from 'node:crypto';
import { verify } from 'argon2';
import type { PasswordVerifier } from '../application/ports/session-tokens.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

export class Argon2PasswordVerifier implements PasswordVerifier {
  private constructor(private readonly dummyHash: string) {}

  static async create() {
    const dummyHash = await new Argon2PasswordHasher().hash(
      randomBytes(32).toString('base64url'),
    );
    return new Argon2PasswordVerifier(dummyHash);
  }

  async verify(passwordHash: string | null, password: string) {
    const matches = await verify(passwordHash ?? this.dummyHash, password);
    return passwordHash !== null && matches;
  }
}
