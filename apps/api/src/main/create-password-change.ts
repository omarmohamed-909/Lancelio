import { ChangePassword } from '../modules/auth/application/change-password.js';
import { Argon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher.js';
import { Argon2PasswordVerifier } from '../modules/auth/infrastructure/argon2-password-verifier.js';
import { MongoPasswordChangeStore } from '../modules/auth/infrastructure/mongo-password-change-store.js';
import { createPasswordChangeAttemptModel } from '../modules/auth/infrastructure/password-change-attempt-model.js';
import type { RegistrationModels } from '../modules/auth/infrastructure/registration-models.js';
import type { SessionModel } from '../modules/auth/infrastructure/session-model.js';
import type { RecoveryModels } from '../modules/auth/infrastructure/recovery-models.js';
import type { Clock } from '../modules/auth/application/ports/session-tokens.js';
export async function createPasswordChange(
  models: RegistrationModels,
  sessions: SessionModel,
  jobs: RecoveryModels['Job'],
  clock: Clock = { now: () => new Date() },
) {
  const attempts = createPasswordChangeAttemptModel(models.User.db);
  await attempts.createCollection();
  await attempts.createIndexes();
  const store = new MongoPasswordChangeStore(models, sessions, jobs, attempts);
  return {
    attempts,
    store,
    service: new ChangePassword(
      store,
      await Argon2PasswordVerifier.create(),
      new Argon2PasswordHasher(),
      clock,
    ),
  };
}
