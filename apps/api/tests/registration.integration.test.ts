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
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';

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
  }, 240_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await models.Membership.deleteMany({});
    await models.Workspace.deleteMany({});
    await models.User.deleteMany({});
    app = createApp('http://localhost:3000', {
      registerAccount: new RegisterAccount(
        new MongoRegistrationStore(database, models),
        new Argon2PasswordHasher(),
      ),
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replicaSet?.stop();
  });

  it('creates related records atomically and returns an explicit safe DTO', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
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
    expect(response.headers['set-cookie']).toBeUndefined();

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
      request(app).post('/api/v1/auth/register').send(input),
      request(app)
        .post('/api/v1/auth/register')
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
      (await request(app).post('/api/v1/auth/register').send(input)).status,
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
        .send(body);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await models.User.countDocuments()).toBe(0);
      expect(await models.Workspace.countDocuments()).toBe(0);
      expect(await models.Membership.countDocuments()).toBe(0);
    },
  );

  it('enforces database uniqueness independently of application validation', async () => {
    await request(app).post('/api/v1/auth/register').send(input);
    await expect(
      models.User.create({
        name: 'Another',
        email: 'ahmed@example.com',
        passwordHash: 'hash',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('limits attempts before expensive hashing and persistence', async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(
        (await request(app).post('/api/v1/auth/register').send({})).status,
      ).toBe(422);
    }
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send(input);
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(await models.User.countDocuments()).toBe(0);
  });
});
