import { validateRegistration } from '../domain/registration.js';
import type { RegistrationInput } from '../domain/registration.js';
import { sessionPolicy } from '../domain/session.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import type { RegistrationSessionStore } from './ports/registration-session-store.js';
import type { Clock, SessionTokens } from './ports/session-tokens.js';

export class RegisterAndSignIn {
  constructor(
    private readonly store: RegistrationSessionStore,
    private readonly hasher: PasswordHasher,
    private readonly tokens: SessionTokens,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegistrationInput) {
    const registration = validateRegistration(input);
    const passwordHash = await this.hasher.hash(registration.password);
    const { identity, grant } = await this.store.createOwnerAccountAndSession(
      {
        name: registration.name,
        email: registration.email,
        workspaceName: registration.workspaceName,
        passwordHash,
      },
      async (identity) => {
        const now = this.clock.now();
        const refresh = this.tokens.createRefreshCredentials();
        const accessToken = await this.tokens.signAccess(
          {
            userId: identity.user.id,
            workspaceId: identity.workspace.id,
            sessionId: refresh.sessionId,
          },
          now,
        );
        return {
          sessionId: refresh.sessionId,
          refreshTokenHash: refresh.tokenHash,
          accessToken,
          expiresIn: sessionPolicy.accessLifetimeSeconds,
          refreshToken: refresh.token,
          refreshExpiresAt: new Date(
            now.getTime() + sessionPolicy.refreshLifetimeSeconds * 1000,
          ),
        };
      },
    );
    return {
      identity,
      accessToken: grant.accessToken,
      expiresIn: grant.expiresIn,
      refreshToken: grant.refreshToken,
      refreshExpiresAt: grant.refreshExpiresAt,
    };
  }
}
