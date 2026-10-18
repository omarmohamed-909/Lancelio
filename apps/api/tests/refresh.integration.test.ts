import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from '../src/main/create-app.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { connectDatabase } from '../src/main/database.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { createConsumedRefreshModel } from '../src/modules/auth/infrastructure/consumed-refresh-model.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';

const origin = 'http://localhost:3000';
const account = {
  name: 'Ahmed',
  email: 'ahmed@example.com',
  password: 'a secure password for tests',
};

function cookieValue(header: unknown) {
  const cookie: unknown = Array.isArray(header) ? header[0] : header;
  return typeof cookie === 'string' ? (cookie.split(';')[0] ?? '') : '';
}
function digest(cookie: string) {
  return createHash('sha256')
    .update(cookie.split('=')[1] ?? '')
    .digest('hex');
}

describe('Atomic refresh rotation and logout', () => {
  let replicaSet: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let sessionModel: ReturnType<typeof createSessionModel>;
  let consumed: ReturnType<typeof createConsumedRefreshModel>;
  let sessions: Awaited<ReturnType<typeof createAuthentication>>;
  let registerAccount: RegisterAccount;
  let app: ReturnType<typeof createApp>;
  let now: Date;
  let initialCookie: string;
  let initialAccess: string;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: {
        ...mongoBinaryOptions(),
        downloadDir: resolve(
          import.meta.dirname,
          '../../../.cache/mongodb-binaries',
        ),
      },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    database = await connectDatabase(replicaSet.getUri('refresh-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    sessions = await createAuthentication(
      models,
      sessionModel,
      'unit-test-signing-secret-at-least-32-characters',
      false,
      { now: () => now },
    );
    consumed = createConsumedRefreshModel(database);
    registerAccount = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
  }, 240_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    now = new Date();
    await consumed.deleteMany({});
    await sessionModel.deleteMany({});
    await models.Membership.deleteMany({});
    await models.Workspace.deleteMany({});
    await models.User.deleteMany({});
    app = createApp(origin, { sessions });
    await registerAccount.execute(account);
    const response = await login();
    expect(response.status).toBe(200);
    initialCookie = cookieValue(response.headers['set-cookie']);
    initialAccess = response.body.data.accessToken;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replicaSet?.stop();
  });

  function login() {
    return request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: account.email, password: account.password });
  }
  function mutation(action: 'refresh' | 'logout', cookie?: string) {
    let attempt = request(app)
      .post(`/api/v1/auth/${action}`)
      .set('Origin', origin);
    if (cookie) attempt = attempt.set('Cookie', cookie);
    return attempt;
  }
  function me(token: string) {
    return request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
  }

  it('renews an expired access token, atomically consumes the refresh secret, and preserves absolute session expiry', async () => {
    const original = await sessionModel.findOne().orFail();
    now = new Date(now.getTime() + 901_000);
    expect((await me(initialAccess)).status).toBe(401);
    const refreshed = await mutation('refresh', initialCookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.expiresIn).toBe(900);
    expect(refreshed.body.data.refreshToken).toBeUndefined();
    expect(refreshed.headers['cache-control']).toBe('no-store');
    const nextCookie = cookieValue(refreshed.headers['set-cookie']);
    expect(nextCookie).not.toBe(initialCookie);
    expect((await me(refreshed.body.data.accessToken)).status).toBe(200);
    const current = await sessionModel
      .findOne()
      .select('+refreshTokenHash')
      .orFail();
    expect(current._id).toBe(original._id);
    expect(current.refreshTokenHash).toBe(digest(nextCookie));
    expect(current.expiresAt.getTime()).toBe(original.expiresAt.getTime());
    const previous = await consumed.findById(digest(initialCookie)).orFail();
    expect(previous.session).toBe(original._id);
    expect(previous.expiresAt.getTime()).toBe(original.expiresAt.getTime());
  });

  it('keeps existing access tokens live after ordinary rotation, but invalidates the entire session on ancient token reuse', async () => {
    const otherDevice = await login();
    const first = await mutation('refresh', initialCookie);
    expect((await me(initialAccess)).status).toBe(200);
    expect(first.body.data.accessToken).not.toBe(initialAccess);
    const second = await mutation(
      'refresh',
      cookieValue(first.headers['set-cookie']),
    );
    expect(second.status).toBe(200);
    const replay = await mutation('refresh', initialCookie);
    expect(replay.status).toBe(401);
    expect(cookieValue(replay.headers['set-cookie'])).toBe('lancelio_refresh=');
    expect((await me(initialAccess)).status).toBe(401);
    expect((await me(second.body.data.accessToken)).status).toBe(401);
    expect(
      (await mutation('refresh', cookieValue(second.headers['set-cookie'])))
        .status,
    ).toBe(401);
    expect((await me(otherDevice.body.data.accessToken)).status).toBe(200);
    expect((await login()).status).toBe(200);
  });

  it('allows only one concurrent rotation and commits replay revocation for the losing request', async () => {
    const results = await Promise.all([
      mutation('refresh', initialCookie),
      mutation('refresh', initialCookie),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    expect(await consumed.countDocuments()).toBe(1);
    const current = await sessionModel.findOne().orFail();
    expect(current.revokedAt).not.toBeNull();
    const success = results.find((result) => result.status === 200);
    expect((await me(success?.body.data.accessToken)).status).toBe(401);
    expect(
      (await mutation('refresh', cookieValue(success?.headers['set-cookie'])))
        .status,
    ).toBe(401);
  });

  it.each(['expired', 'revoked'])(
    'rejects a %s session and clears its browser cookie',
    async (state) => {
      if (state === 'expired')
        now = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      else await sessionModel.updateOne({}, { revokedAt: now });
      const response = await mutation('refresh', initialCookie);
      expect(response.status).toBe(401);
      expect(cookieValue(response.headers['set-cookie'])).toBe(
        'lancelio_refresh=',
      );
      expect(await consumed.countDocuments()).toBe(0);
    },
  );

  it.each([
    undefined,
    'lancelio_refresh=malformed',
    `lancelio_refresh=${'A'.repeat(43)}`,
  ])(
    'rejects missing or invalid refresh credentials without revoking another session: %s',
    async (cookie) => {
      expect((await mutation('refresh', cookie)).status).toBe(401);
      expect((await me(initialAccess)).status).toBe(200);
      expect(await consumed.countDocuments()).toBe(0);
    },
  );

  it('rejects ambiguous duplicate cookies and body-supplied tokens', async () => {
    expect(
      (await mutation('refresh', `${initialCookie}; ${initialCookie}`)).status,
    ).toBe(401);
    const injected = await mutation('refresh', initialCookie).send({
      refreshToken: 'body-secret',
      workspaceId: 'other',
    });
    expect(injected.status).toBe(422);
    expect((await me(initialAccess)).status).toBe(200);
  });

  it.each(['refresh', 'logout'] as const)(
    'requires the exact browser Origin before %s can mutate or clear a session',
    async (action) => {
      for (const wrongOrigin of [undefined, 'https://attacker.example']) {
        let attempt = request(app)
          .post(`/api/v1/auth/${action}`)
          .set('Cookie', initialCookie);
        if (wrongOrigin) attempt = attempt.set('Origin', wrongOrigin);
        const response = await attempt;
        expect(response.status).toBe(403);
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      expect((await me(initialAccess)).status).toBe(200);
    },
  );

  it.each(['suspended', 'membership-removed', 'workspace-deleted'])(
    'refuses to refresh after %s and revokes the affected session',
    async (state) => {
      if (state === 'suspended')
        await models.User.updateOne({}, { status: 'suspended' });
      if (state === 'membership-removed')
        await models.Membership.deleteMany({});
      if (state === 'workspace-deleted') await models.Workspace.deleteMany({});
      expect((await mutation('refresh', initialCookie)).status).toBe(401);
      expect((await sessionModel.findOne().orFail()).revokedAt).not.toBeNull();
    },
  );

  it('rolls back the changed current hash if persisting the consumed token fails', async () => {
    vi.spyOn(consumed, 'create').mockRejectedValue(
      new Error('private-history-failure'),
    );
    const response = await mutation('refresh', initialCookie);
    expect(response.status).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(
      'private-history-failure',
    );
    expect(
      (await sessionModel.findOne().select('+refreshTokenHash').orFail())
        .refreshTokenHash,
    ).toBe(digest(initialCookie));
    expect(await consumed.countDocuments()).toBe(0);
    expect((await me(initialAccess)).status).toBe(200);
    vi.restoreAllMocks();
    expect((await mutation('refresh', initialCookie)).status).toBe(200);
  });

  it('logs out immediately, clears the cookie, and remains idempotent', async () => {
    const response = await mutation('logout', initialCookie);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(cookieValue(response.headers['set-cookie'])).toBe(
      'lancelio_refresh=',
    );
    expect((await me(initialAccess)).status).toBe(401);
    expect((await mutation('refresh', initialCookie)).status).toBe(401);
    expect((await mutation('logout', initialCookie)).status).toBe(204);
    expect((await mutation('logout')).status).toBe(204);
  });

  it('accepts a consumed refresh cookie for logout and leaves another device session active', async () => {
    const otherDevice = await login();
    const refreshed = await mutation('refresh', initialCookie);
    expect((await mutation('logout', initialCookie)).status).toBe(204);
    expect((await me(refreshed.body.data.accessToken)).status).toBe(401);
    expect((await me(otherDevice.body.data.accessToken)).status).toBe(200);
  });

  it('does not report successful logout or clear the cookie when database revocation fails', async () => {
    vi.spyOn(sessionModel, 'updateOne').mockRejectedValue(
      new Error('private-revocation-failure'),
    );
    const response = await mutation('logout', initialCookie);
    expect(response.status).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(
      'private-revocation-failure',
    );
  });

  it('refreshes and clears Secure host-only production cookies with matching settings', async () => {
    const productionOrigin = 'https://app.example.com';
    const productionApp = createApp(productionOrigin, {
      sessions: { ...sessions, secureCookies: true },
    });
    const loggedIn = await request(productionApp)
      .post('/api/v1/auth/login')
      .set('Origin', productionOrigin)
      .send({ email: account.email, password: account.password });
    const refreshed = await request(productionApp)
      .post('/api/v1/auth/refresh')
      .set('Origin', productionOrigin)
      .set('Cookie', cookieValue(loggedIn.headers['set-cookie']));
    expect(refreshed.status).toBe(200);
    const refreshHeader: unknown = refreshed.headers['set-cookie'];
    const attributes = Array.isArray(refreshHeader)
      ? String(refreshHeader[0])
      : String(refreshHeader);
    expect(attributes).toContain('__Host-lancelio_refresh=');
    expect(attributes).toContain('Secure');
    expect(attributes).toContain('HttpOnly');
    expect(attributes).toContain('SameSite=Strict');
    expect(attributes).not.toContain('Domain=');
    const loggedOut = await request(productionApp)
      .post('/api/v1/auth/logout')
      .set('Origin', productionOrigin)
      .set('Cookie', cookieValue(refreshed.headers['set-cookie']));
    expect(loggedOut.status).toBe(204);
    const logoutHeader: unknown = loggedOut.headers['set-cookie'];
    expect(
      Array.isArray(logoutHeader)
        ? String(logoutHeader[0])
        : String(logoutHeader),
    ).toContain('Secure');
    expect(cookieValue(logoutHeader)).toBe('__Host-lancelio_refresh=');
  });

  it('limits refresh attempts without revoking an unrelated valid credential', async () => {
    for (let attempt = 0; attempt < 30; attempt++)
      expect((await mutation('refresh')).status).toBe(401);
    const blocked = await mutation('refresh', initialCookie);
    expect(blocked.status).toBe(429);
    expect((await me(initialAccess)).status).toBe(200);
    expect(await consumed.countDocuments()).toBe(0);
  });
});
