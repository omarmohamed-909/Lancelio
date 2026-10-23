import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createApp } from '../src/main/create-app.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { createProfile } from '../src/main/create-profile.js';
import { connectDatabase } from '../src/main/database.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';

const origin = 'http://localhost:3000';
const account = {
  name: 'أحمد علي',
  email: 'profile@example.com',
  password: 'profile test secure passphrase',
  workspaceName: 'مساحة أحمد',
};

describe('own profile settings with real Mongo CAS', () => {
  let replica: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let sessions: Awaited<ReturnType<typeof createAuthentication>>;
  let sessionModel: ReturnType<typeof createSessionModel>;
  let register: RegisterAccount;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({
      binary: {
        ...mongoBinaryOptions(),
        downloadDir: resolve(
          import.meta.dirname,
          '../../../.cache/mongodb-binaries',
        ),
      },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    database = await connectDatabase(replica.getUri('profile-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    sessions = await createAuthentication(
      models,
      sessionModel,
      'profile-test-signing-secret-at-least-32-characters',
      false,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    app = createApp(origin, {
      sessions,
      registerAccount: sessions.register,
      profile: createProfile(models.User),
    });
  }, 240_000);
  beforeEach(async () => {
    await sessionModel.deleteMany({});
    await models.Membership.deleteMany({});
    await models.Workspace.deleteMany({});
    await models.User.deleteMany({});
    const result = await register.execute(account);
    userId = result.user.id;
    token = (await sessions.login.execute(account)).accessToken;
  });
  afterAll(async () => {
    await database?.close();
    await replica?.stop();
  });

  const read = () =>
    request(app)
      .get('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${token}`);
  const update = (body: Record<string, unknown>, from = origin) =>
    request(app)
      .put('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', from)
      .send(body);

  it('returns only own allowlisted profile and retains credentials, sessions and workspace identity after saving', async () => {
    const before = await models.User.findById(userId)
      .select('+passwordHash')
      .lean();
    const workspace = await models.Workspace.findOne().lean();
    const memberships = await models.Membership.find().lean();
    const sessionsBefore = await sessionModel
      .find()
      .select('+refreshTokenHash')
      .lean();
    const initial = await read();
    expect(initial.status).toBe(200);
    expect(initial.headers['cache-control']).toBe('no-store');
    expect(initial.body.data).toEqual({
      id: userId,
      name: account.name,
      email: account.email,
      version: 0,
    });
    const saved = await update({ name: '  🌟مصمم  ', version: 0 });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({
      id: userId,
      name: '🌟مصمم',
      email: account.email,
      version: 1,
    });
    const after = await models.User.findById(userId)
      .select('+passwordHash')
      .lean();
    expect(after).toMatchObject({
      passwordHash: before!.passwordHash,
      email: account.email,
      status: 'active',
      authFence: before!.authFence,
    });
    expect(await models.Workspace.findOne().lean()).toEqual(workspace);
    expect(await models.Membership.find().lean()).toEqual(memberships);
    expect(
      await sessionModel.find().select('+refreshTokenHash').lean(),
    ).toEqual(sessionsBefore);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.body.data.user.name).toBe('🌟مصمم');
    expect((await sessions.login.execute(account)).identity.user.name).toBe(
      '🌟مصمم',
    );
    const anotherWorkspace = await models.Workspace.create({
      name: 'مساحة ثانية',
      slug: 'profile-second-space',
      owner: userId,
    });
    await models.Membership.create({
      user: userId,
      workspace: anotherWorkspace._id,
      role: 'admin',
    });
    const otherSession = await sessions.login.execute({
      ...account,
      workspaceId: anotherWorkspace.id,
    });
    const otherProfile = await request(app)
      .get('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${otherSession.accessToken}`);
    expect(otherProfile.body.data).toEqual(saved.body.data);
    expect(otherSession.identity.workspace.id).toBe(anotherWorkspace.id);
  });

  it('never exposes or changes another user, even in the same workspace', async () => {
    const other = await register.execute({
      ...account,
      email: 'other@example.com',
      name: 'عضو آخر',
    });
    const shared = await models.Workspace.findOne({ owner: userId }).orFail();
    await models.Membership.create({
      workspace: shared._id,
      user: other.user.id,
      role: 'member',
    });
    expect((await update({ name: 'اسمي الجديد', version: 0 })).status).toBe(
      200,
    );
    expect((await models.User.findById(other.user.id).orFail()).name).toBe(
      'عضو آخر',
    );
    expect((await read()).body.data.id).toBe(userId);
    expect(
      (
        await request(app)
          .get('/api/v1/settings/profile/' + other.user.id)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(404);
  });

  it.each(['owner', 'admin', 'member'] as const)(
    'permits own name changes for role %s',
    async (role) => {
      await models.Membership.updateOne({ user: userId }, { $set: { role } });
      expect((await update({ name: 'عضو المساحة', version: 0 })).status).toBe(
        200,
      );
    },
  );

  it.each([
    'userId',
    'role',
    'status',
    'workspaceId',
    'email',
    'password',
    'passwordHash',
    'authFence',
  ])('rejects the injected %s field without mutation', async (field) => {
    expect(
      (await update({ name: 'اسم مختلف', version: 0, [field]: 'injected' }))
        .status,
    ).toBe(422);
    expect((await read()).body.data).toMatchObject({
      name: account.name,
      version: 0,
    });
  });

  it.each(['', ' ', 'ع', '🌟', 'ع'.repeat(101), '🌟'.repeat(101)])(
    'rejects invalid Unicode display name %#',
    async (name) => {
      expect((await update({ name, version: 0 })).status).toBe(422);
      expect((await read()).body.data.version).toBe(0);
    },
  );

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, null, '0'])(
    'rejects invalid revision %#',
    async (version) => {
      expect((await update({ name: 'اسم صحيح', version })).status).toBe(422);
    },
  );

  it('supports 100 Unicode characters and registration follows the same personal-name rule', async () => {
    expect((await update({ name: '🌟'.repeat(100), version: 0 })).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/register')
          .set('Origin', origin)
          .send({ ...account, email: 'unicode@example.com', name: '🌟' })
      ).status,
    ).toBe(422);
    expect(
      (
        await register.execute({
          ...account,
          email: 'unicode@example.com',
          name: '🌟'.repeat(100),
          workspaceName: 'مساحة مختلفة',
        })
      ).user.name,
    ).toBe('🌟'.repeat(100));
  });

  it('allows exactly one concurrent writer and requires a fresh revision for the loser', async () => {
    const responses = await Promise.all([
      update({ name: 'نافذة أولى', version: 0 }),
      update({ name: 'نافذة ثانية', version: 0 }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)!.body.error.code).toBe(
      'PROFILE_CONFLICT',
    );
    expect((await read()).body.data.version).toBe(1);
    expect(
      (await update({ name: 'بعد المراجعة', version: 1 })).body.data.version,
    ).toBe(2);
  });

  it('migrates a legacy profile atomically from zero without touching credentials', async () => {
    await models.User.collection.updateOne(
      { _id: (await models.User.findById(userId).orFail())._id },
      { $unset: { profileVersion: '' } },
    );
    expect((await read()).body.data.version).toBe(0);
    const responses = await Promise.all([
      update({ name: 'أول تعديل', version: 0 }),
      update({ name: 'تعديل متزامن', version: 0 }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await read()).body.data.version).toBe(1);
  });

  it('rejects suspended accounts, revoked sessions and foreign origins', async () => {
    expect((await request(app).get('/api/v1/settings/profile')).status).toBe(
      401,
    );
    expect(
      (
        await update(
          { name: 'اسم صحيح', version: 0 },
          'https://foreign.example',
        )
      ).status,
    ).toBe(403);
    await models.User.updateOne(
      { _id: userId },
      { $set: { status: 'suspended' } },
    );
    expect((await read()).status).toBe(401);
    expect((await update({ name: 'اسم صحيح', version: 0 })).status).toBe(401);
    await models.User.updateOne(
      { _id: userId },
      { $set: { status: 'active' } },
    );
    await sessionModel.updateMany({}, { $set: { revokedAt: new Date() } });
    expect((await read()).status).toBe(401);
  });
});
