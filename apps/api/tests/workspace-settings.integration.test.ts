import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { createApp } from '../src/main/create-app.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { createWorkspaceSettings } from '../src/main/create-workspace-settings.js';
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
  email: 'workspace@example.com',
  password: 'workspace test secure passphrase',
  workspaceName: 'مساحة أحمد',
};

describe('workspace settings: live owner policy and real Mongo CAS', () => {
  let replica: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let sessions: Awaited<ReturnType<typeof createAuthentication>>;
  let sessionModel: ReturnType<typeof createSessionModel>;
  let register: RegisterAccount;
  let service: ReturnType<typeof createWorkspaceSettings>;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let scope: { userId: string; workspaceId: string };

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
    database = await connectDatabase(
      replica.getUri('workspace-settings-tests'),
    );
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    sessions = await createAuthentication(
      models,
      sessionModel,
      'workspace-test-signing-secret-at-least-32-characters',
      false,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    service = createWorkspaceSettings(models);
    app = createApp(origin, { sessions, workspaceSettings: service });
  }, 240_000);
  beforeEach(async () => {
    await sessionModel.deleteMany({});
    await models.Membership.deleteMany({});
    await models.Workspace.deleteMany({});
    await models.User.deleteMany({});
    const identity = await register.execute(account);
    scope = { userId: identity.user.id, workspaceId: identity.workspace.id };
    token = (await sessions.login.execute(account)).accessToken;
  });
  afterAll(async () => {
    await database?.close();
    await replica?.stop();
  });
  const read = () =>
    request(app)
      .get('/api/v1/settings/workspace')
      .set('Authorization', `Bearer ${token}`);
  const update = (body: Record<string, unknown>, from = origin) =>
    request(app)
      .put('/api/v1/settings/workspace')
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', from)
      .send(body);

  it('allowlists settings and changes only the name/version while preserving logical identity, memberships, credentials and sessions', async () => {
    const before = await models.Workspace.findById(scope.workspaceId)
      .orFail()
      .lean();
    const user = await models.User.findById(scope.userId)
      .select('+passwordHash')
      .orFail()
      .lean();
    const membership = await models.Membership.findOne().orFail().lean();
    const activeSessions = await sessionModel
      .find()
      .select('+refreshTokenHash')
      .lean();
    const initial = await read();
    expect(initial.status).toBe(200);
    expect(initial.headers['cache-control']).toBe('no-store');
    expect(initial.body.data).toEqual({
      id: scope.workspaceId,
      name: account.workspaceName,
      slug: before.slug,
      version: 0,
      role: 'owner',
      canEdit: true,
    });
    const saved = await update({ name: '  🌟استوديو جديد  ', version: 0 });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({
      ...initial.body.data,
      name: '🌟استوديو جديد',
      version: 1,
    });
    expect(
      await models.Workspace.findById(scope.workspaceId).lean(),
    ).toMatchObject({
      _id: before._id,
      owner: before.owner,
      plan: before.plan,
      slug: before.slug,
      createdAt: before.createdAt,
    });
    expect(await models.Membership.findOne().lean()).toEqual(membership);
    expect(
      await models.User.findById(scope.userId).select('+passwordHash').lean(),
    ).toMatchObject({
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      profileVersion: user.profileVersion,
      status: user.status,
      updatedAt: user.updatedAt,
    });
    expect(
      await sessionModel.find().select('+refreshTokenHash').lean(),
    ).toEqual(activeSessions);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.body.data.workspace).toEqual({
      id: scope.workspaceId,
      name: '🌟استوديو جديد',
      slug: before.slug,
    });
  });

  for (const role of ['admin', 'member'] as const) {
    it(`reads but forbids ${role} writes with an existing owner-issued token`, async () => {
      await models.Membership.updateOne(
        { user: scope.userId },
        { $set: { role } },
      );
      const result = await read();
      expect(result.status).toBe(200);
      expect(result.body.data).toMatchObject({ role, canEdit: false });
      const blocked = await update({ name: 'Blocked workspace', version: 0 });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('WORKSPACE_ACCESS_DENIED');
      expect(
        (await models.Workspace.findById(scope.workspaceId).orFail()).name,
      ).toBe(account.workspaceName);
    });
  }
  it('denies a forged owner membership belonging to another actual owner', async () => {
    const other = await register.execute({
      ...account,
      email: 'other@example.com',
    });
    await models.Workspace.updateOne(
      { _id: scope.workspaceId },
      { $set: { owner: other.user.id } },
    );
    expect((await read()).body.data.canEdit).toBe(false);
    expect(
      (await update({ name: 'Blocked workspace', version: 0 })).status,
    ).toBe(403);
  });
  for (const change of ['removed', 'downgraded', 'suspended'] as const) {
    it(`rechecks ${change} access inside the store after earlier authentication`, async () => {
      await sessions.authenticate.execute(token);
      if (change === 'removed')
        await models.Membership.deleteOne({ user: scope.userId });
      else if (change === 'downgraded')
        await models.Membership.updateOne(
          { user: scope.userId },
          { $set: { role: 'member' } },
        );
      else
        await models.User.updateOne(
          { _id: scope.userId },
          { $set: { status: 'suspended' } },
        );
      await expect(
        service.update(scope, { name: 'Blocked workspace', version: 0 }),
      ).rejects.toMatchObject({
        code:
          change === 'suspended'
            ? 'UNAUTHENTICATED'
            : 'WORKSPACE_ACCESS_DENIED',
      });
      expect(
        (await models.Workspace.findById(scope.workspaceId).orFail())
          .settingsVersion,
      ).toBe(0);
    });
  }
  it('scopes reads and writes to the selected verified workspace for multi-workspace users', async () => {
    const other = await register.execute({
      ...account,
      email: 'second@example.com',
    });
    await models.Membership.create({
      user: scope.userId,
      workspace: other.workspace.id,
      role: 'admin',
    });
    const selected = await sessions.login.execute({
      ...account,
      workspaceId: other.workspace.id,
    });
    token = selected.accessToken;
    expect((await read()).body.data.id).toBe(other.workspace.id);
    expect(
      (await update({ name: 'Blocked workspace', version: 0 })).status,
    ).toBe(403);
    await expect(
      service.read({ ...scope, userId: other.user.id }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' });
    expect(
      (await models.Workspace.findById(scope.workspaceId).orFail())
        .settingsVersion,
    ).toBe(0);
  });
  it('serializes simultaneous version-zero writes; a conflict rolls back authorization fences', async () => {
    const results = await Promise.all([
      update({ name: 'First workspace', version: 0 }),
      update({ name: 'Second workspace', version: 0 }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const current = (await read()).body.data;
    expect(current.version).toBe(1);
    expect(
      (await models.Membership.findOne().select('+settingsFence').orFail())
        .settingsFence,
    ).toBe(1);
    expect(
      (await update({ name: 'Reviewed workspace', version: current.version }))
        .status,
    ).toBe(200);
    expect((await read()).body.data.version).toBe(2);
  });
  it('supports legacy records without settingsVersion and avoids version churn for a trimmed no-op', async () => {
    await models.Workspace.collection.updateOne(
      { _id: (await models.Workspace.findOne().orFail())._id },
      { $unset: { settingsVersion: '' } },
    );
    expect((await read()).body.data.version).toBe(0);
    expect(
      (await update({ name: `  ${account.workspaceName}  `, version: 0 })).body
        .data.version,
    ).toBe(0);
    expect(
      (await update({ name: 'New legacy name', version: 0 })).body.data.version,
    ).toBe(1);
  });
  for (const name of ['🌟🌟', 'ع'.repeat(100), '🌟'.repeat(100)]) {
    it(`accepts a valid Unicode name of ${Array.from(name).length} characters / ${name.length} UTF-16 units`, async () => {
      expect((await update({ name, version: 0 })).status).toBe(200);
    });
  }
  for (const body of [
    { name: '', version: 0 },
    { name: ' ', version: 0 },
    { name: 'ع', version: 0 },
    { name: '🌟', version: 0 },
    { name: 'ع'.repeat(101), version: 0 },
    { name: 'Valid name', version: -1 },
    { name: 'Valid name', version: 0.5 },
    { name: 'Valid name', version: Number.MAX_SAFE_INTEGER },
    { name: 'Valid name' },
    { name: 22, version: 0 },
    { name: 'Valid name', version: 0, workspaceId: '000000000000000000000001' },
    { name: 'Valid name', version: 0, owner: '000000000000000000000001' },
    { name: 'Valid name', version: 0, plan: 'agency' },
    { name: 'Valid name', version: 0, slug: 'replace' },
  ]) {
    it(`rejects invalid or overposted settings ${JSON.stringify(body)}`, async () => {
      expect((await update(body)).status).toBe(422);
      expect(
        (await models.Workspace.findById(scope.workspaceId).orFail())
          .settingsVersion,
      ).toBe(0);
    });
  }
  it('requires a live session and trusted origin, including no-store errors', async () => {
    expect((await request(app).get('/api/v1/settings/workspace')).status).toBe(
      401,
    );
    const denied = await update(
      { name: 'New workspace', version: 0 },
      'https://foreign.example',
    );
    expect(denied.status).toBe(403);
    expect(denied.headers['cache-control']).toBe('no-store');
    await sessionModel.updateMany({}, { $set: { revokedAt: new Date() } });
    expect((await read()).status).toBe(401);
    expect((await update({ name: 'New workspace', version: 0 })).status).toBe(
      401,
    );
  });
  it('rolls back both authorization fences on a database write failure and exposes no infrastructure details', async () => {
    const beforeUser = await models.User.findById(scope.userId).lean();
    const beforeMember = await models.Membership.findOne()
      .select('+settingsFence')
      .lean();
    const failed = vi
      .spyOn(models.Workspace, 'findOneAndUpdate')
      .mockImplementationOnce(() => {
        throw new Error('private database failure');
      });
    try {
      const result = await update({
        name: 'Uncommitted workspace',
        version: 0,
      });
      expect(result.status).toBe(500);
      expect(result.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(result.body)).not.toContain('private database');
      expect(failed).toHaveBeenCalledTimes(1);
      expect(await models.User.findById(scope.userId).lean()).toEqual(
        beforeUser,
      );
      expect(
        await models.Membership.findOne().select('+settingsFence').lean(),
      ).toEqual(beforeMember);
      expect((await read()).body.data.version).toBe(0);
    } finally {
      failed.mockRestore();
    }
  });
});
