import { GoogleSignIn } from '../modules/auth/application/google-sign-in.js';
import type { GoogleTokenVerifier } from '../modules/auth/application/ports/google-auth.js';
import { JoseGoogleTokenVerifier } from '../modules/auth/infrastructure/google-token-verifier.js';
import { createGoogleChallengeModel } from '../modules/auth/infrastructure/google-challenge-model.js';
import { MongoGoogleAccountStore } from '../modules/auth/infrastructure/mongo-google-account-store.js';
import { MongoSessionStore } from '../modules/auth/infrastructure/mongo-session-store.js';
import { JoseSessionTokens } from '../modules/auth/infrastructure/jose-session-tokens.js';
import { Argon2PasswordVerifier } from '../modules/auth/infrastructure/argon2-password-verifier.js';
import type { RegistrationModels } from '../modules/auth/infrastructure/registration-models.js';
import type { SessionModel } from '../modules/auth/infrastructure/session-model.js';
export async function createGoogleAuthentication(
  models: RegistrationModels,
  sessions: SessionModel,
  signingSecret: string,
  clientId: string,
  secureCookies: boolean,
  verifier: GoogleTokenVerifier = new JoseGoogleTokenVerifier(clientId),
) {
  const challenges = createGoogleChallengeModel(models.User.db);
  await challenges.createCollection();
  await challenges.createIndexes();
  const accounts = new MongoGoogleAccountStore(models, challenges);
  return {
    clientId,
    secureCookies,
    challenge: (nonce: string, expiresAt: Date) =>
      accounts.challenge(nonce, expiresAt),
    signIn: new GoogleSignIn(
      verifier,
      accounts,
      new MongoSessionStore(models, sessions),
      await Argon2PasswordVerifier.create(),
      new JoseSessionTokens(signingSecret),
      { now: () => new Date() },
    ),
  };
}
