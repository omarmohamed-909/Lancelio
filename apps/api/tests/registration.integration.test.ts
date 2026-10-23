import { resolve } from 'node:path';
import { verify } from 'argon2';
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
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
import { connectDatabase } from '../src/main/database.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';

import { createAuthentication } from '../src/main/create-authentication.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { JoseSessionTokens } from '../src/modules/auth/infrastructure/jose-session-tokens.js';

const origin = 'http://localhost:3000';
const input = {
  name: 'Ahmed',
  email: ' AHMED@Example.COM ',
  password: 'a secure password for tests',
  workspaceName: 'Ahmed Studio',
};

describe('Registration against a real MongoDB replica set', () => {
  let replicaSet: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let app: ReturnType<typeof createApp>;
  let sessionModel: ReturnType<typeof createSessionModel>;
  let auth: Awaited<ReturnType<typeof createAuthentication>>;

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
    database = await connectDatabase(replicaSet.getUri('registration-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    auth = await createAuthentication(
      models,
      sessionModel,
      'registration-test-secret-at-least-thirty-two-characters',
      false,
    );
  }, 240_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await sessionModel.deleteMany({});
    await models.Membership.deleteMany({});
    await models.Workspace.deleteMany({});
    await models.User.deleteMany({});
    app = createApp(origin, { registerAccount: auth.register, sessions: auth });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replicaSet?.stop();
  });

  it('creates related records atomically and returns an explicit safe DTO', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(input);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        user: { name: 'Ahmed', email: 'ahmed@example.com' },
        workspace: { name: 'Ahmed Studio' },
        membership: { role: 'owner' },
      },
    });
    expect(Object.keys(response.body.data.user).sort()).toEqual([
      'email',
      'id',
      'name',
    ]);
    expect(JSON.stringify(response.body)).not.toContain(input.password);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(response.headers['cache-control']).toBe('no-store');
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(response.body.data.tokenType).toBe('Bearer');
    expect(response.body.data.expiresIn).toBe(900);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user).toEqual(response.body.data.user);
    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie.split(';')[0]!)
      .send({});
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.user).toEqual(response.body.data.user);
    expect(await sessionModel.countDocuments()).toBe(1);
    expect(JSON.stringify(response.body)).not.toMatch(
      /refreshToken|passwordHash|refreshTokenHash|sessionId/,
    );

    const user = await models.User.findOne().select('+passwordHash').orFail();
    const workspace = await models.Workspace.findOne().orFail();
    const membership = await models.Membership.findOne().orFail();
    expect(user.passwordHash?.startsWith('$argon2id$')).toBe(true);
    if (!user.passwordHash)
      throw new Error('Password registration must store a hash');
    expect(await verify(user.passwordHash, input.password)).toBe(true);
    expect(
      (await models.User.findById(user._id).lean())?.passwordHash,
    ).toBeUndefined();
    expect(workspace.owner.toString()).toBe(user._id.toString());
    expect(membership.user.toString()).toBe(user._id.toString());
    expect(membership.workspace.toString()).toBe(workspace._id.toString());
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data.workspace.id).toBe(workspace.id);
    expect(response.body.data.membership.id).toBe(membership.id);
  });

  it('rejects concurrent registrations for the same normalized email without orphan records', async () => {
    const responses = await Promise.all([
      request(app)
        .post('/api/v1/auth/register')
        .set('Origin', origin)
        .send(input),
      request(app)
        .post('/api/v1/auth/register')
        .set('Origin', origin)
        .send({ ...input, email: 'ahmed@example.com' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      responses.find((response) => response.status === 409)?.body.error.code,
    ).toBe('EMAIL_ALREADY_REGISTERED');
    expect(await models.User.countDocuments()).toBe(1);
    expect(await models.Workspace.countDocuments()).toBe(1);
    expect(await models.Membership.countDocuments()).toBe(1);
  });

  it('rolls back the user and workspace if the final membership write fails', async () => {
    vi.spyOn(models.Membership.prototype, 'save').mockRejectedValue(
      new Error('private-injected-failure'),
    );
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(input);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain(
      'private-injected-failure',
    );
    expect(await models.User.countDocuments()).toBe(0);
    expect(await models.Workspace.countDocuments()).toBe(0);
    expect(await models.Membership.countDocuments()).toBe(0);
    vi.restoreAllMocks();
    expect(
      (
        await request(app)
          .post('/api/v1/auth/register')
          .set('Origin', origin)
          .send(input)
      ).status,
    ).toBe(201);
  });

  it.each([
    { ...input, email: 'invalid' },
    { ...input, password: 'short' },
    { ...input, name: ' ' },
    { ...input, workspaceName: ' ' },
    { ...input, role: 'admin' },
    { ...input, workspace: 'someone-elses-workspace' },
    { ...input, email: { $ne: null } },
  ])(
    'rejects invalid input or injected fields without writes: %j',
    async (body) => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', origin)
        .send(body);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await models.User.countDocuments()).toBe(0);
      expect(await models.Workspace.countDocuments()).toBe(0);
      expect(await models.Membership.countDocuments()).toBe(0);
    },
  );

  it('enforces database uniqueness independently of application validation', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(input);
    await expect(
      models.User.create({
        name: 'Another',
        email: 'ahmed@example.com',
        passwordHash: 'hash',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects missing and foreign origins before creating an account or a session', async () => {
    for (const value of [undefined, 'https://foreign.example.com']) {
      const call = request(app).post('/api/v1/auth/register');
      if (value) call.set('Origin', value);
      const response = await call.send(input);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(await models.User.countDocuments()).toBe(0);
    expect(await sessionModel.countDocuments()).toBe(0);
  });
  it.each(['session', 'token'])(
    'rolls back the account and workspace when first %s issuance fails',
    async (failure) => {
      if (failure === 'session')
        vi.spyOn(sessionModel, 'create').mockRejectedValue(
          new Error('private-session-failure'),
        );
      else
        vi.spyOn(JoseSessionTokens.prototype, 'signAccess').mockRejectedValue(
          new Error('private-token-failure'),
        );
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Origin', origin)
        .send(input);
      expect(response.status).toBe(500);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await models.User.countDocuments()).toBe(0);
      expect(await models.Workspace.countDocuments()).toBe(0);
      expect(await models.Membership.countDocuments()).toBe(0);
      expect(await sessionModel.countDocuments()).toBe(0);
      expect(JSON.stringify(response.body)).not.toContain('private-');
      vi.restoreAllMocks();
      expect(
        (
          await request(app)
            .post('/api/v1/auth/register')
            .set('Origin', origin)
            .send(input)
        ).status,
      ).toBe(201);
    },
  );
  it('limits attempts before expensive hashing and persistence', async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(
        (
          await request(app)
            .post('/api/v1/auth/register')
            .set('Origin', origin)
            .send({})
        ).status,
      ).toBe(422);
    }
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(input);
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(await models.User.countDocuments()).toBe(0);
  });
});
