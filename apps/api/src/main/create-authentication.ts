import { AuthenticateSession } from '../modules/auth/application/authenticate-session.js';
import { Login } from '../modules/auth/application/login.js';
import { RefreshSession } from '../modules/auth/application/refresh-session.js';
import { Logout } from '../modules/auth/application/logout.js';
import { createConsumedRefreshModel } from '../modules/auth/infrastructure/consumed-refresh-model.js';
import { MongoRefreshSessionStore } from '../modules/auth/infrastructure/mongo-refresh-session-store.js';
import type { Clock } from '../modules/auth/application/ports/session-tokens.js';
import { Argon2PasswordVerifier } from '../modules/auth/infrastructure/argon2-password-verifier.js';
import { JoseSessionTokens } from '../modules/auth/infrastructure/jose-session-tokens.js';
import { MongoSessionStore } from '../modules/auth/infrastructure/mongo-session-store.js';
import type { RegistrationModels } from '../modules/auth/infrastructure/registration-models.js';
import type { SessionModel } from '../modules/auth/infrastructure/session-model.js';

export async function createAuthentication(
  models: RegistrationModels,
  sessions: SessionModel,
  signingSecret: string,
  secureCookies: boolean,
  clock: Clock = { now: () => new Date() },
) {
  const store = new MongoSessionStore(models, sessions);
  const tokens = new JoseSessionTokens(signingSecret);
  const verifier = await Argon2PasswordVerifier.create();
  const consumed = createConsumedRefreshModel(sessions.db);
  await consumed.createCollection();
  await consumed.createIndexes();
  const refreshStore = new MongoRefreshSessionStore(sessions, consumed);
  return {
    login: new Login(store, verifier, tokens, clock),
    authenticate: new AuthenticateSession(store, tokens, clock),
    refresh: new RefreshSession(refreshStore, store, tokens, tokens, clock),
    logout: new Logout(refreshStore, tokens, clock),
    secureCookies,
  };
}
