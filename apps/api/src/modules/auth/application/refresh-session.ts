import { sessionPolicy, unauthenticated } from '../domain/session.js';
import type {
  RefreshSessionStore,
  RefreshTokenCodec,
} from './ports/refresh-session-store.js';
import type { SessionStore } from './ports/session-store.js';
import type { Clock, SessionTokens } from './ports/session-tokens.js';

export class RefreshSession {
  constructor(
    private readonly refreshStore: RefreshSessionStore,
    private readonly identities: Pick<SessionStore, 'findIdentity'>,
    private readonly tokens: SessionTokens,
    private readonly codec: RefreshTokenCodec,
    private readonly clock: Clock,
  ) {}

  async execute(refreshToken: string | undefined) {
    if (!refreshToken || !/^[A-Za-z0-9_-]{43}$/u.test(refreshToken))
      throw unauthenticated();
    const now = this.clock.now();
    const previousHash = this.codec.hashRefreshToken(refreshToken);
    const session = await this.refreshStore.findByTokenHash(previousHash);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now.getTime()
    )
      throw unauthenticated();
    if (session.consumed) {
      await this.refreshStore.revokeByTokenHash(previousHash, now);
      throw unauthenticated();
    }
    const identity = await this.identities.findIdentity(
      session.userId,
      session.workspaceId,
    );
    if (!identity) {
      await this.refreshStore.revokeByTokenHash(previousHash, now);
      throw unauthenticated();
    }
    const next = this.codec.createRefreshSecret();
    const accessToken = await this.tokens.signAccess(session, now);
    const outcome = await this.refreshStore.rotate(
      previousHash,
      next.tokenHash,
      now,
    );
    if (outcome !== 'rotated') throw unauthenticated();
    return {
      identity,
      accessToken,
      expiresIn: sessionPolicy.accessLifetimeSeconds,
      refreshToken: next.token,
      refreshExpiresAt: session.expiresAt,
    };
  }
}
