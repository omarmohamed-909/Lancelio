import { unauthenticated } from '../domain/session.js';
import type { SessionStore } from './ports/session-store.js';
import type { Clock, SessionTokens } from './ports/session-tokens.js';

export class AuthenticateSession {
  constructor(
    private readonly store: SessionStore,
    private readonly tokens: SessionTokens,
    private readonly clock: Clock,
  ) {}

  async execute(accessToken: string) {
    return (await this.context(accessToken)).identity;
  }

  async context(accessToken: string) {
    const now = this.clock.now();
    const claims = await this.tokens.verifyAccess(accessToken, now);
    if (!claims || !(await this.store.isSessionActive(claims, now)))
      throw unauthenticated();
    const identity = await this.store.findIdentity(
      claims.userId,
      claims.workspaceId,
    );
    if (!identity) throw unauthenticated();
    return { identity, claims };
  }
}
