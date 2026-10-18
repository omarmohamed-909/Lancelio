import { argon2id, hash } from 'argon2';
import type { PasswordHasher } from '../application/ports/password-hasher.js';

export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
  }
}
