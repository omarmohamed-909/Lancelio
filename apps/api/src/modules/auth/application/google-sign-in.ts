import { ApplicationError } from '../../../shared/domain/application-error.js';
import { isValidDisplayName } from '../domain/display-name.js';
import { sessionPolicy } from '../domain/session.js';
import type {
  GoogleAccountStore,
  GoogleTokenVerifier,
} from './ports/google-auth.js';
import type { SessionStore } from './ports/session-store.js';
import type {
  Clock,
  PasswordVerifier,
  SessionTokens,
} from './ports/session-tokens.js';

export class GoogleSignIn {
  constructor(
    private readonly verifier: GoogleTokenVerifier,
    private readonly accounts: GoogleAccountStore,
    private readonly sessions: SessionStore,
    private readonly passwords: PasswordVerifier,
    private readonly tokens: SessionTokens,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    credential: string;
    nonce: string;
    name?: string;
    workspaceName?: string;
    linkPassword?: string;
  }) {
    const now = this.clock.now();
    const profile = await this.verifier.verify(
      input.credential,
      input.nonce,
      now,
    );
    const account = await this.accounts.find(profile);
    if (account && account.status !== 'active')
      throw new ApplicationError(
        'GOOGLE_INVALID_CREDENTIALS',
        'Google sign-in could not be completed',
      );
    if (account && account.subject !== profile.subject) {
      if (account.subject || !account.passwordHash)
        throw new ApplicationError(
          'GOOGLE_ACCOUNT_CONFLICT',
          'Use the sign-in method already linked to this account',
        );
      if (input.linkPassword === undefined)
        return { kind: 'link-required' as const, email: profile.email };
      if (
        !(await this.passwords.verify(account.passwordHash, input.linkPassword))
      )
        throw new ApplicationError(
          'INVALID_CREDENTIALS',
          'Account password is incorrect',
        );
    }
    const name = input.name?.trim();
    const workspaceName = input.workspaceName?.trim();
    if (!account) {
      if (name === undefined || workspaceName === undefined)
        return {
          kind: 'onboarding-required' as const,
          email: profile.email,
          name: isValidDisplayName(profile.name) ? profile.name : '',
        };
      const fields: Record<string, string> = {};
      if (!isValidDisplayName(name))
        fields.name = 'Name must contain 2 to 100 characters';
      if (!isValidDisplayName(workspaceName))
        fields.workspaceName =
          'Workspace name must contain 2 to 100 characters';
      if (Object.keys(fields).length)
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Invalid registration data',
          fields,
        );
    }
    const user = await this.accounts.complete({
      nonce: input.nonce,
      now,
      profile,
      existing: account,
      ...(name !== undefined ? { name } : {}),
      ...(workspaceName !== undefined ? { workspaceName } : {}),
    });
    const identity = await this.sessions.findIdentity(user.userId);
    if (!identity)
      throw new ApplicationError(
        'WORKSPACE_ACCESS_DENIED',
        'Workspace access is denied',
      );
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
    await this.sessions.createSession(
      {
        ...claims,
        refreshTokenHash: refresh.tokenHash,
        expiresAt: refreshExpiresAt,
      },
      user.passwordHash,
    );
    return {
      kind: 'authenticated' as const,
      identity,
      accessToken,
      expiresIn: sessionPolicy.accessLifetimeSeconds,
      refreshToken: refresh.token,
      refreshExpiresAt,
    };
  }
}
