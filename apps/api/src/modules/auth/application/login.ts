import { ApplicationError } from '../../../shared/domain/application-error.js';
import { sessionPolicy, validateLogin } from '../domain/session.js';
import type { LoginInput } from '../domain/session.js';
import type { SessionStore } from './ports/session-store.js';
import type {
  Clock,
  PasswordVerifier,
  SessionTokens,
} from './ports/session-tokens.js';

export class Login {
  constructor(
    private readonly store: SessionStore,
    private readonly verifier: PasswordVerifier,
    private readonly tokens: SessionTokens,
    private readonly clock: Clock,
  ) {}

  async execute(input: LoginInput) {
    const validated = validateLogin(input);
    const credentials = await this.store.findCredentials(validated.email);
    const verified = await this.verifier.verify(
      credentials?.passwordHash ?? null,
      validated.password,
    );
    if (!credentials || !verified || credentials.status !== 'active') {
      throw new ApplicationError(
        'INVALID_CREDENTIALS',
        'Email or password is incorrect',
      );
    }
    const identity = await this.store.findIdentity(
      credentials.userId,
      validated.workspaceId,
    );
    if (!identity)
      throw new ApplicationError(
        'WORKSPACE_ACCESS_DENIED',
        'Workspace access is denied',
      );

    const now = this.clock.now();
    const refresh = this.tokens.createRefreshCredentials();
    const claims = {
      userId: identity.user.id,
      workspaceId: identity.workspace.id,
      sessionId: refresh.sessionId,
    };
    const accessToken = await this.tokens.signAccess(claims, now);
    const refreshExpiresAt = new Date(
      now.getTime() + sessionPolicy.refreshLifetimeSeconds * 1000,
    );
    await this.store.createSession(
      {
        ...claims,
        refreshTokenHash: refresh.tokenHash,
        expiresAt: refreshExpiresAt,
      },
      credentials.passwordHash,
    );
    return {
      identity,
      accessToken,
      expiresIn: sessionPolicy.accessLifetimeSeconds,
      refreshToken: refresh.token,
      refreshExpiresAt,
    };
  }
}
