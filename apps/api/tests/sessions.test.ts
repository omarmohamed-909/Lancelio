import { describe, expect, it, vi } from 'vitest';
import { Login } from '../src/modules/auth/application/login.js';
import { AuthenticateSession } from '../src/modules/auth/application/authenticate-session.js';
import type { SessionStore } from '../src/modules/auth/application/ports/session-store.js';
import type {
  PasswordVerifier,
  SessionTokens,
} from '../src/modules/auth/application/ports/session-tokens.js';
import type { AuthenticatedIdentity } from '../src/modules/auth/domain/session.js';

const identity: AuthenticatedIdentity = {
  user: { id: 'user', name: 'Ahmed', email: 'ahmed@example.com' },
  workspace: { id: 'workspace', name: 'Studio', slug: 'studio' },
  membership: { id: 'membership', role: 'owner' },
};
const now = new Date('2026-10-08T10:00:00Z');
const input = {
  email: ' AHMED@Example.COM ',
  password: 'a secure password for tests',
};

function setup() {
  const store = {
    findCredentials: vi
      .fn<SessionStore['findCredentials']>()
      .mockResolvedValue({
        userId: 'user',
        passwordHash: 'stored-hash',
        status: 'active',
      }),
    findIdentity: vi
      .fn<SessionStore['findIdentity']>()
      .mockResolvedValue(identity),
    createSession: vi
      .fn<SessionStore['createSession']>()
      .mockResolvedValue(undefined),
    isSessionActive: vi
      .fn<SessionStore['isSessionActive']>()
      .mockResolvedValue(true),
  };
  const verifier = {
    verify: vi.fn<PasswordVerifier['verify']>().mockResolvedValue(true),
  };
  const tokens = {
    createRefreshCredentials: vi
      .fn<SessionTokens['createRefreshCredentials']>()
      .mockReturnValue({
        sessionId: 'session',
        token: 'refresh-secret',
        tokenHash: 'refresh-digest',
      }),
    signAccess: vi
      .fn<SessionTokens['signAccess']>()
      .mockResolvedValue('access-token'),
    verifyAccess: vi.fn<SessionTokens['verifyAccess']>().mockResolvedValue({
      userId: 'user',
      workspaceId: 'workspace',
      sessionId: 'session',
    }),
  };
  const clock = { now: () => now };
  return {
    store,
    verifier,
    tokens,
    login: new Login(store, verifier, tokens, clock),
    authenticate: new AuthenticateSession(store, tokens, clock),
  };
}

describe('Session use cases', () => {
  it('normalizes email and stores the refresh digest rather than the raw secret', async () => {
    const { login, store } = setup();
    const result = await login.execute(input);
    expect(store.findCredentials).toHaveBeenCalledWith('ahmed@example.com');
    expect(store.createSession).toHaveBeenCalledWith(
      {
        userId: 'user',
        workspaceId: 'workspace',
        sessionId: 'session',
        refreshTokenHash: 'refresh-digest',
        expiresAt: new Date('2026-10-15T10:00:00Z'),
      },
      'stored-hash',
    );
    expect(result.expiresIn).toBe(900);
  });

  it('performs dummy password verification for an unknown email and creates no session', async () => {
    const { login, store, verifier } = setup();
    store.findCredentials.mockResolvedValue(null);
    await expect(login.execute(input)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(verifier.verify).toHaveBeenCalledWith(null, input.password);
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it('does not select a workspace or create a session on an incorrect password', async () => {
    const { login, store, verifier } = setup();
    verifier.verify.mockResolvedValue(false);
    await expect(login.execute(input)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(store.findIdentity).not.toHaveBeenCalled();
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it('does not persist a session when access token signing fails', async () => {
    const { login, store, tokens } = setup();
    tokens.signAccess.mockRejectedValue(new Error('signing failed'));
    await expect(login.execute(input)).rejects.toThrow('signing failed');
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it.each([
    { password: '' },
    { password: 'x'.repeat(129) },
    { workspaceId: 'invalid' },
  ])(
    'validates input before querying credential data: %j',
    async (override) => {
      const { login, store } = setup();
      await expect(
        login.execute({ ...input, ...override }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(store.findCredentials).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid access tokens without querying session or identity data', async () => {
    const { authenticate, tokens, store } = setup();
    tokens.verifyAccess.mockResolvedValue(null);
    await expect(authenticate.execute('invalid-token')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(store.isSessionActive).not.toHaveBeenCalled();
    expect(store.findIdentity).not.toHaveBeenCalled();
  });

  it('requires a live session before resolving workspace membership', async () => {
    const { authenticate, store } = setup();
    store.isSessionActive.mockResolvedValue(false);
    await expect(authenticate.execute('access-token')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(store.findIdentity).not.toHaveBeenCalled();
  });

  it('resolves identity with the signed user and workspace, never caller-supplied IDs', async () => {
    const { authenticate, store } = setup();
    expect(await authenticate.execute('access-token')).toEqual(identity);
    expect(store.findIdentity).toHaveBeenCalledWith('user', 'workspace');
  });
});
