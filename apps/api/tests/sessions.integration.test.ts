import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { SignJWT } from 'jose';
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
import { JoseSessionTokens } from '../src/modules/auth/infrastructure/jose-session-tokens.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';

const origin = 'http://localhost:3000';
const secret = 'unit-test-signing-secret-at-least-32-characters';
const account = {
  name: 'Ahmed',
  email: 'ahmed@example.com',
  password: 'a secure password for tests',
};

function firstCookie(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

describe('Login and authenticated workspace access', () => {
  let replicaSet: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let sessionModel: ReturnType<typeof createSessionModel>;
  let sessions: Awaited<ReturnType<typeof createAuthentication>>;
  let registerAccount: RegisterAccount;
  let app: ReturnType<typeof createApp>;
  let now: Date;

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
    database = await connectDatabase(replicaSet.getUri('sessions-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    sessions = await createAuthentication(models, sessionModel, secret, false, {
      now: () => now,
    });
    registerAccount = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
  }, 240_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    now = new Date();
    await sessionModel.deleteMany({});
    await models.Membership.deleteMany({});
    await models.Workspace.deleteMany({});
    await models.User.deleteMany({});
    app = createApp(origin, { registerAccount: sessions.register, sessions });
    await registerAccount.execute(account);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replicaSet?.stop();
  });

  function login(body = { email: account.email, password: account.password }) {
    return request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send(body);
  }
  function me(token: string) {
    return request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
  }

  it('issues an access token and HttpOnly refresh cookie, persists only a hash, and serves /me', async () => {
    const success = await login({
      email: ' AHMED@Example.COM ',
      password: account.password,
    });
    expect(success.status).toBe(200);
    expect(success.body.data).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { email: account.email },
      membership: { role: 'owner' },
    });
    expect(success.headers['cache-control']).toBe('no-store');
    expect(success.body.data.refreshToken).toBeUndefined();
    expect(success.body.data.passwordHash).toBeUndefined();
    const cookie = firstCookie(success.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
    const refreshToken = cookie.split(';')[0]?.split('=')[1] ?? '';
    expect(refreshToken.length).toBeGreaterThan(40);
    const stored = await sessionModel
      .findOne()
      .select('+refreshTokenHash')
      .orFail();
    expect(stored.refreshTokenHash).toBe(
      createHash('sha256').update(refreshToken).digest('hex'),
    );
    expect(stored.refreshTokenHash).not.toBe(refreshToken);
    expect(stored.expiresAt.getTime()).toBe(
      now.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    expect(
      (await sessionModel.findOne().lean())?.refreshTokenHash,
    ).toBeUndefined();
    const identity = await me(success.body.data.accessToken);
    expect(identity.status).toBe(200);
    expect(identity.body.data).toEqual({
      user: success.body.data.user,
      workspace: success.body.data.workspace,
      membership: success.body.data.membership,
    });
    expect(identity.headers['cache-control']).toBe('no-store');
  });

  it('uses a Secure host-only cookie in production mode', async () => {
    const productionApp = createApp(origin, {
      sessions: { ...sessions, secureCookies: true },
    });
    const response = await request(productionApp)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: account.email, password: account.password });
    const cookie = firstCookie(response.headers['set-cookie']);
    expect(cookie).toMatch(/^__Host-lancelio_refresh=/u);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('Domain=');
  });

  it('returns the same error for wrong passwords and nonexistent or suspended accounts', async () => {
    const wrong = await login({
      email: account.email,
      password: 'wrong-password',
    });
    const unknown = await login({
      email: 'unknown@example.com',
      password: account.password,
    });
    await models.User.updateOne(
      { email: account.email },
      { status: 'suspended' },
    );
    const suspended = await login();
    expect([wrong.status, unknown.status, suspended.status]).toEqual([
      401, 401, 401,
    ]);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body).toEqual(suspended.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(await sessionModel.countDocuments()).toBe(0);
  });

  it.each([undefined, 'https://attacker.example'])(
    'rejects login from an untrusted or absent browser origin: %s',
    async (untrustedOrigin) => {
      let attempt = request(app).post('/api/v1/auth/login');
      if (untrustedOrigin) attempt = attempt.set('Origin', untrustedOrigin);
      const response = await attempt.send({
        email: account.email,
        password: account.password,
      });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN');
      expect(await sessionModel.countDocuments()).toBe(0);
    },
  );

  it('refuses a workspace that belongs to another account', async () => {
    const other = await registerAccount.execute({
      ...account,
      email: 'other@example.com',
    });
    const denied = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({
        email: account.email,
        password: account.password,
        workspaceId: other.workspace.id,
      });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('WORKSPACE_ACCESS_DENIED');
    expect(await sessionModel.countDocuments()).toBe(0);
    const permitted = await login();
    const identity = await me(permitted.body.data.accessToken);
    expect(identity.body.data.workspace.id).not.toBe(other.workspace.id);
  });

  it('does not accept a token when its workspace no longer has the current user as a member', async () => {
    const response = await login();
    await models.Membership.deleteMany({});
    expect((await me(response.body.data.accessToken)).status).toBe(401);
  });

  it('reflects current membership roles rather than trusting token role claims', async () => {
    const response = await login();
    await models.Membership.updateOne({}, { role: 'member' });
    expect(
      (await me(response.body.data.accessToken)).body.data.membership.role,
    ).toBe('member');
  });

  it.each(['suspended', 'deleted'])(
    'rejects a previously issued token after user becomes %s',
    async (status) => {
      const response = await login();
      await models.User.updateOne({}, { status });
      expect((await me(response.body.data.accessToken)).status).toBe(401);
    },
  );

  it.each(['revoked', 'expired', 'deleted'])(
    'rejects tokens from a %s session',
    async (state) => {
      const response = await login();
      if (state === 'revoked')
        await sessionModel.updateOne({}, { revokedAt: now });
      if (state === 'expired')
        await sessionModel.updateOne({}, { expiresAt: now });
      if (state === 'deleted') await sessionModel.deleteMany({});
      expect((await me(response.body.data.accessToken)).status).toBe(401);
    },
  );

  it('rejects expired access tokens even when the refresh session is still valid', async () => {
    const response = await login();
    now = new Date(now.getTime() + 900_000);
    expect((await me(response.body.data.accessToken)).status).toBe(401);
    expect(await sessionModel.countDocuments()).toBe(1);
  });

  it.each([undefined, 'Basic abc', 'Bearer malformed', 'Bearer token extra'])(
    'rejects absent or malformed authorization headers: %s',
    async (header) => {
      let attempt = request(app).get('/api/v1/auth/me');
      if (header) attempt = attempt.set('Authorization', header);
      const response = await attempt;
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    },
  );

  it('rejects a token signed with a different key and a tampered workspace claim', async () => {
    const user = await models.User.findOne().orFail();
    const workspace = await models.Workspace.findOne().orFail();
    const wrongKey = new JoseSessionTokens(
      'a-different-signing-key-with-32-characters',
    );
    const wrongToken = await wrongKey.signAccess(
      {
        userId: user.id,
        workspaceId: workspace.id,
        sessionId: 'not-a-valid-session',
      },
      now,
    );
    expect((await me(wrongToken)).status).toBe(401);
    const response = await login();
    const parts = (response.body.data.accessToken as string).split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ sub: user.id, workspaceId: '000000000000000000000001' }),
    ).toString('base64url');
    expect((await me(parts.join('.'))).status).toBe(401);
  });

  it.each([
    {
      issuer: 'another-api',
      audience: 'lancelio-web',
      algorithm: 'HS256',
      type: 'at+jwt',
    },
    {
      issuer: 'lancelio-api',
      audience: 'another-client',
      algorithm: 'HS256',
      type: 'at+jwt',
    },
    {
      issuer: 'lancelio-api',
      audience: 'lancelio-web',
      algorithm: 'HS384',
      type: 'at+jwt',
    },
    {
      issuer: 'lancelio-api',
      audience: 'lancelio-web',
      algorithm: 'HS256',
      type: 'JWT',
    },
  ])(
    'rejects signed tokens with unsupported metadata: %j',
    async (metadata) => {
      const token = await new SignJWT({
        sid: 'session',
        workspaceId: 'workspace',
      })
        .setProtectedHeader({ alg: metadata.algorithm, typ: metadata.type })
        .setIssuer(metadata.issuer)
        .setAudience(metadata.audience)
        .setSubject('user')
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(new TextEncoder().encode(secret));
      expect((await me(token)).status).toBe(401);
    },
  );

  it('rejects signed tokens that lack required expiration claims', async () => {
    const token = await new SignJWT({
      sid: 'session',
      workspaceId: 'workspace',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setIssuer('lancelio-api')
      .setAudience('lancelio-web')
      .setSubject('user')
      .setIssuedAt()
      .sign(new TextEncoder().encode(secret));
    expect((await me(token)).status).toBe(401);
  });

  it('does not issue a token or cookie when session persistence fails', async () => {
    vi.spyOn(sessionModel, 'create').mockRejectedValue(
      new Error('private-session-store-failure'),
    );
    const response = await login();
    expect(response.status).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(
      'private-session-store-failure',
    );
  });

  it('allows repeated successful sign-ins to different accounts from the same network', async () => {
    const second = {
      ...account,
      email: 'second@example.com',
      name: 'Second User',
    };
    const registered = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(second);
    expect(registered.status).toBe(201);
    for (let attempt = 0; attempt < 12; attempt++) {
      const selected = attempt % 2 === 0 ? account : second;
      const response = await login({
        email: selected.email,
        password: selected.password,
      });
      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe(selected.email);
      expect(
        (await me(response.body.data.accessToken)).body.data.user.email,
      ).toBe(selected.email);
    }
    expect(await models.User.countDocuments()).toBe(2);
    expect(await sessionModel.countDocuments()).toBe(13);
  }, 30000);
  it('contains repeated wrong passwords to the normalized mailbox without blocking another account', async () => {
    const second = {
      ...account,
      email: 'second@example.com',
      name: 'Second User',
    };
    await registerAccount.execute(second);
    for (let attempt = 0; attempt < 10; attempt++) {
      const email = attempt % 2 === 0 ? ' AHMED@Example.COM ' : account.email;
      expect(
        (await login({ email, password: 'incorrect password' })).status,
      ).toBe(401);
    }
    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(
      (await login({ email: second.email, password: second.password })).status,
    ).toBe(200);
    expect(await sessionModel.countDocuments()).toBe(1);
  }, 30000);
  it('also limits failures across rotating mailboxes before expensive verification', async () => {
    for (let attempt = 0; attempt < 60; attempt++)
      expect(
        (await login({ email: `attempt-${attempt}@example.com`, password: '' }))
          .status,
      ).toBe(422);
    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(await sessionModel.countDocuments()).toBe(0);
  });
  it('limits login requests before password verification', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login({ email: account.email, password: '' })).status).toBe(
        422,
      );
    }
    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(await sessionModel.countDocuments()).toBe(0);
  });
});
