import type {
  RefreshSessionStore,
  RefreshTokenCodec,
} from './ports/refresh-session-store.js';
import type { Clock } from './ports/session-tokens.js';

export class Logout {
  constructor(
    private readonly store: Pick<RefreshSessionStore, 'revokeByTokenHash'>,
    private readonly codec: Pick<RefreshTokenCodec, 'hashRefreshToken'>,
    private readonly clock: Clock,
  ) {}

  async execute(refreshToken: string | undefined): Promise<void> {
    if (refreshToken && /^[A-Za-z0-9_-]{43}$/u.test(refreshToken)) {
      await this.store.revokeByTokenHash(
        this.codec.hashRefreshToken(refreshToken),
        this.clock.now(),
      );
    }
  }
}
