import { PasswordRecovery } from '../modules/auth/application/password-recovery.js';
import type { Clock } from '../modules/auth/application/ports/session-tokens.js';
import type { RecoveryMailer } from '../modules/auth/application/ports/password-recovery.js';
import { Argon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher.js';
import { EncryptedRecoverySecrets } from '../modules/auth/infrastructure/recovery-secrets.js';
import { MongoRecoveryStore } from '../modules/auth/infrastructure/mongo-recovery-store.js';
import { createRecoveryModels } from '../modules/auth/infrastructure/recovery-models.js';
import type { RegistrationModels } from '../modules/auth/infrastructure/registration-models.js';
import type { SessionModel } from '../modules/auth/infrastructure/session-model.js';
export async function createPasswordRecovery(
  users: RegistrationModels['User'],
  sessions: SessionModel,
  secret: string,
  mailer: RecoveryMailer | null,
  clock: Clock = { now: () => new Date() },
) {
  const models = createRecoveryModels(users.db);
  for (const model of Object.values(models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  const store = new MongoRecoveryStore(models, users, sessions);
  const service = new PasswordRecovery(
    store,
    new EncryptedRecoverySecrets(secret),
    new Argon2PasswordHasher(),
    mailer,
    clock,
  );
  return { models, store, service };
}
