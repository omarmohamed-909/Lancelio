import { describe, expect, it, vi } from 'vitest';
import { RefreshSession } from '../src/modules/auth/application/refresh-session.js';
import { Logout } from '../src/modules/auth/application/logout.js';
import type {
  RefreshSessionStore,
  RefreshTokenCodec,
} from '../src/modules/auth/application/ports/refresh-session-store.js';
import type { SessionStore } from '../src/modules/auth/application/ports/session-store.js';
import type { SessionTokens } from '../src/modules/auth/application/ports/session-tokens.js';
import type { AuthenticatedIdentity } from '../src/modules/auth/domain/session.js';

const now = new Date('2026-10-08T10:00:00Z');
const token = 'A'.repeat(43);
const identity: AuthenticatedIdentity = {
  user: { id: 'user', name: 'Ahmed', email: 'ahmed@example.com' },
  workspace: { id: 'workspace', name: 'Studio', slug: 'studio' },
  membership: { id: 'membership', role: 'owner' },
};

function setup() {
  const store = {
    findByTokenHash: vi
      .fn<RefreshSessionStore['findByTokenHash']>()
      .mockResolvedValue({
        userId: 'user',
        workspaceId: 'workspace',
        sessionId: 'session',
        expiresAt: new Date('2026-10-15T10:00:00Z'),
        revokedAt: null,
        consumed: false,
      }),
    rotate: vi.fn<RefreshSessionStore['rotate']>().mockResolvedValue('rotated'),
    revokeByTokenHash: vi
      .fn<RefreshSessionStore['revokeByTokenHash']>()
      .mockResolvedValue(undefined),
  };
  const identities = {
    findIdentity: vi
      .fn<SessionStore['findIdentity']>()
      .mockResolvedValue(identity),
  };
  const codec = {
    hashRefreshToken: vi
      .fn<RefreshTokenCodec['hashRefreshToken']>()
      .mockReturnValue('previous-hash'),
    createRefreshSecret: vi
      .fn<RefreshTokenCodec['createRefreshSecret']>()
      .mockReturnValue({ token: 'next-secret', tokenHash: 'next-hash' }),
  };
  const tokens = {
    createRefreshCredentials:
      vi.fn<SessionTokens['createRefreshCredentials']>(),
    verifyAccess: vi.fn<SessionTokens['verifyAccess']>(),
    signAccess: vi
      .fn<SessionTokens['signAccess']>()
      .mockResolvedValue('next-access'),
  };
  const clock = { now: () => now };
  return {
    store,
    identities,
    codec,
    tokens,
    refresh: new RefreshSession(store, identities, tokens, codec, clock),
    logout: new Logout(store, codec, clock),
  };
}

describe('Refresh and logout use cases', () => {
  it('preserves absolute expiry and hands only digests to rotation', async () => {
    const { refresh, store } = setup();
    const result = await refresh.execute(token);
    expect(store.rotate).toHaveBeenCalledWith(
      'previous-hash',
      'next-hash',
      now,
    );
    expect(result.refreshExpiresAt).toEqual(new Date('2026-10-15T10:00:00Z'));
  });

  it.each([undefined, '', 'malformed', 'A'.repeat(44)])(
    'rejects malformed refresh credentials before persistence: %s',
    async (invalid) => {
      const { refresh, store } = setup();
      await expect(refresh.execute(invalid)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
      expect(store.findByTokenHash).not.toHaveBeenCalled();
    },
  );

  it('revokes a known consumed token before attempting signing or identity resolution', async () => {
    const { refresh, store, tokens, identities } = setup();
    store.findByTokenHash.mockResolvedValue({
      userId: 'user',
      workspaceId: 'workspace',
      sessionId: 'session',
      expiresAt: new Date('2026-10-15T10:00:00Z'),
      revokedAt: null,
      consumed: true,
    });
    await expect(refresh.execute(token)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(store.revokeByTokenHash).toHaveBeenCalledWith('previous-hash', now);
    expect(tokens.signAccess).not.toHaveBeenCalled();
    expect(identities.findIdentity).not.toHaveBeenCalled();
  });

  it('does not consume the current refresh token when signing fails', async () => {
    const { refresh, tokens, store } = setup();
    tokens.signAccess.mockRejectedValue(new Error('signing failed'));
    await expect(refresh.execute(token)).rejects.toThrow('signing failed');
    expect(store.rotate).not.toHaveBeenCalled();
  });

  it('revokes sessions that no longer have an active account and workspace membership', async () => {
    const { refresh, store, identities } = setup();
    identities.findIdentity.mockResolvedValue(null);
    await expect(refresh.execute(token)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(store.revokeByTokenHash).toHaveBeenCalledWith('previous-hash', now);
    expect(store.rotate).not.toHaveBeenCalled();
  });

  it.each(['invalid', 'reused'] as const)(
    'does not return credentials after an atomic rotation reports %s',
    async (outcome) => {
      const { refresh, store } = setup();
      store.rotate.mockResolvedValue(outcome);
      await expect(refresh.execute(token)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    },
  );

  it('makes logout a no-op for a missing cookie and revokes a valid secret by digest', async () => {
    const { logout, store } = setup();
    await logout.execute(undefined);
    expect(store.revokeByTokenHash).not.toHaveBeenCalled();
    await logout.execute(token);
    expect(store.revokeByTokenHash).toHaveBeenCalledWith('previous-hash', now);
  });
});
