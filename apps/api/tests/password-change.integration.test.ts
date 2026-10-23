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
import { createPasswordRecovery } from '../src/main/create-password-recovery.js';
import { createPasswordChange } from '../src/main/create-password-change.js';
import { connectDatabase } from '../src/main/database.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { ChangePassword } from '../src/modules/auth/application/change-password.js';
import { Login } from '../src/modules/auth/application/login.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { Argon2PasswordVerifier } from '../src/modules/auth/infrastructure/argon2-password-verifier.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import { MongoSessionStore } from '../src/modules/auth/infrastructure/mongo-session-store.js';
import { JoseSessionTokens } from '../src/modules/auth/infrastructure/jose-session-tokens.js';
import { EncryptedRecoverySecrets } from '../src/modules/auth/infrastructure/recovery-secrets.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { passwordChangePolicy } from '../src/modules/auth/domain/password-change.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
const origin = 'http://localhost:3000';
const secret = 'test-password-change-secret-at-least-thirty-two-characters';
const account = {
  name: 'Ahmed',
  email: 'ahmed@example.com',
  password: 'a secure password for tests',
};
const newPassword = 'new password with spaces for tests';
describe('Signed-in password change: atomic credentials and revocation', () => {
  let replica: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let sessionModel: ReturnType<typeof createSessionModel>;
  let sessions: Awaited<ReturnType<typeof createAuthentication>>;
  let recovery: Awaited<ReturnType<typeof createPasswordRecovery>>;
  let change: Awaited<ReturnType<typeof createPasswordChange>>;
  let register: RegisterAccount;
  let app: ReturnType<typeof createApp>;
  let now: Date;
  let login: Awaited<ReturnType<typeof sessions.login.execute>>;
  const mail: string[] = [];
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
    database = await connectDatabase(replica.getUri('password-change'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    const clock = { now: () => now };
    sessions = await createAuthentication(
      models,
      sessionModel,
      secret,
      false,
      clock,
    );
    recovery = await createPasswordRecovery(
      models.User,
      sessionModel,
      secret,
      {
        send: async (_email, token) => {
          mail.push(token);
        },
      },
      clock,
    );
    change = await createPasswordChange(
      models,
      sessionModel,
      recovery.models.Job,
      clock,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
  }, 240_000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    mail.length = 0;
    now = new Date('2026-10-10T12:01:00.000Z');
    await Promise.all([
      change.attempts.deleteMany({}),
      recovery.models.Job.deleteMany({}),
      recovery.models.Mailbox.deleteMany({}),
      sessionModel.deleteMany({}),
      models.Membership.deleteMany({}),
      models.Workspace.deleteMany({}),
      models.User.deleteMany({}),
    ]);
    await register.execute(account);
    login = await sessions.login.execute(account);
    app = createApp(origin, { sessions, passwordChange: change.service });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replica?.stop();
  });
  function send(
    body: Record<string, unknown> = {
      currentPassword: account.password,
      newPassword,
    },
    token = login.accessToken,
  ) {
    return request(app)
      .post('/api/v1/settings/password')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }
  async function scope() {
    return (await sessions.authenticate.context(login.accessToken)).claims;
  }
  async function issue() {
    await recovery.service.request(account.email);
    await recovery.service.deliverNext();
    return mail.at(-1)!;
  }
  it('changes only the signed-in user, revokes all their workspaces/devices, preserves other users and clears the cookie', async () => {
    const second = await sessions.login.execute(account);
    const other = await register.execute({
      ...account,
      name: 'Other',
      email: 'other@example.com',
    });
    await models.Membership.create({
      user: login.identity.user.id,
      workspace: other.workspace.id,
      role: 'member',
    });
    const third = await sessions.login.execute({
      ...account,
      workspaceId: other.workspace.id,
    });
    const unrelated = await sessions.login.execute({
      ...account,
      email: 'other@example.com',
    });
    const before = await models.User.findById(login.identity.user.id).lean();
    const response = await send();
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']![0]).toMatch(
      /lancelio_refresh=;.*HttpOnly; SameSite=Strict/u,
    );
    expect(JSON.stringify(response.body)).not.toContain(newPassword);
    for (const old of [login, second, third]) {
      await expect(
        sessions.authenticate.execute(old.accessToken),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(
        sessions.refresh.execute(old.refreshToken),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
    expect(
      (await sessions.authenticate.execute(unrelated.accessToken)).user.id,
    ).toBe(other.user.id);
    await expect(sessions.login.execute(account)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(
      (await sessions.login.execute({ ...account, password: newPassword }))
        .identity.user.id,
    ).toBe(login.identity.user.id);
    const after = await models.User.findById(login.identity.user.id)
      .select('+passwordHash')
      .lean();
    expect(after).toMatchObject({
      name: before!.name,
      email: before!.email,
      status: before!.status,
      profileVersion: before!.profileVersion,
      emailVerified: before!.emailVerified,
      passwordChangedAt: now,
    });
    expect(after!.passwordHash).toMatch(/^\$argon2id\$/u);
    expect(after!.passwordHash).not.toContain(newPassword);
  });
  it.each(['owner', 'admin', 'member'] as const)(
    'allows own-account changes for %s',
    async (role) => {
      await models.Membership.updateOne(
        { user: login.identity.user.id },
        { $set: { role } },
      );
      expect((await send()).status).toBe(204);
    },
  );
  it('rejects a wrong current password without revoking or updating credentials', async () => {
    const response = await send({ currentPassword: 'incorrect', newPassword });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      (await sessions.authenticate.execute(login.accessToken)).user.email,
    ).toBe(account.email);
    expect((await sessions.login.execute(account)).identity.user.email).toBe(
      account.email,
    );
  });
  it.each([
    { currentPassword: '', newPassword },
    { currentPassword: 'x'.repeat(129), newPassword },
    { currentPassword: account.password, newPassword: 'x'.repeat(14) },
    { currentPassword: account.password, newPassword: '😀'.repeat(129) },
    { currentPassword: account.password, newPassword: account.password },
    { currentPassword: account.password, newPassword, userId: 'another' },
    { currentPassword: account.password, newPassword, role: 'owner' },
    {
      currentPassword: account.password,
      newPassword,
      email: 'other@example.com',
    },
    { currentPassword: account.password, newPassword, workspaceId: 'another' },
    { currentPassword: 123, newPassword },
  ])('strictly rejects invalid or privileged input %#', async (body) => {
    const response = await send(body);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(
      (await sessions.authenticate.execute(login.accessToken)).user.email,
    ).toBe(account.email);
    expect(await change.attempts.countDocuments()).toBe(0);
  });
  it('preserves whitespace and supports 128 Unicode code points', async () => {
    const password = ' 😀' + '😀'.repeat(125) + ' ';
    expect(Array.from(password)).toHaveLength(128);
    expect(
      (await send({ currentPassword: account.password, newPassword: password }))
        .status,
    ).toBe(204);
    expect(
      (await sessions.login.execute({ ...account, password })).identity.user
        .email,
    ).toBe(account.email);
    await expect(
      sessions.login.execute({ ...account, password: password.trim() }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
  it('requires origin and active authentication, without trusting request user IDs', async () => {
    expect(
      (await request(app).post('/api/v1/settings/password').send({})).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/settings/password')
          .set('Origin', origin)
          .send({})
      ).status,
    ).toBe(401);
    expect((await send(undefined, 'invalid')).status).toBe(401);
    await sessions.logout.execute(login.refreshToken);
    expect((await send()).status).toBe(401);
  });
  it('persists a shared account limit across separate app instances and devices, and resets at the next window', async () => {
    const alternate = createApp(origin, {
      sessions,
      passwordChange: change.service,
    });
    const second = await sessions.login.execute(account);
    for (let i = 0; i < passwordChangePolicy.attempts; i++) {
      const target = i % 2 ? alternate : app;
      expect(
        (
          await request(target)
            .post('/api/v1/settings/password')
            .set('Origin', origin)
            .set(
              'Authorization',
              `Bearer ${i % 2 ? second.accessToken : login.accessToken}`,
            )
            .send({ currentPassword: 'incorrect', newPassword })
        ).status,
      ).toBe(422);
    }
    expect((await send()).status).toBe(429);
    now = new Date(now.getTime() + passwordChangePolicy.windowMs);
    login = await sessions.login.execute(account);
    expect((await send()).status).toBe(204);
  });
  it('reserves only five concurrent account attempts before expensive verification', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        change.store.reserveAttempt(login.identity.user.id, now),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await change.attempts.countDocuments()).toBe(1);
  });
  it('invalidates delivered recovery links and earlier unbound queued requests', async () => {
    const token = await issue();
    now = new Date(now.getTime() + 60_001);
    await recovery.service.request(account.email);
    now = new Date(now.getTime() + 1);
    await send();
    await expect(
      recovery.service.reset(token, 'other secure password for recovery'),
    ).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
    await recovery.service.deliverNext();
    expect(mail).toHaveLength(1);
  });
  it.each(['sessions', 'recovery'] as const)(
    'rolls back credentials and all revocations if %s write fails',
    async (target) => {
      const token = await issue();
      const oldHash = (await models.User.findById(login.identity.user.id)
        .select('+passwordHash')
        .lean())!.passwordHash;
      const fault =
        target === 'sessions'
          ? vi
              .spyOn(sessionModel, 'updateMany')
              .mockRejectedValueOnce(new Error('write failed'))
          : vi
              .spyOn(recovery.models.Job, 'updateMany')
              .mockRejectedValueOnce(new Error('write failed'));
      expect((await send()).status).toBe(500);
      fault.mockRestore();
      expect(
        (await models.User.findById(login.identity.user.id)
          .select('+passwordHash')
          .lean())!.passwordHash,
      ).toBe(oldHash);
      expect(
        (await sessions.authenticate.execute(login.accessToken)).user.email,
      ).toBe(account.email);
      expect(
        await recovery.store.canReset(
          new EncryptedRecoverySecrets(secret).digest(token)!,
          now,
        ),
      ).toBe(true);
      expect((await send()).status).toBe(204);
    },
  );
  it('permits only one concurrent password change and never leaves the losing credential valid', async () => {
    const second = await sessions.login.execute(account);
    const alternatives = [newPassword, 'another concurrent password change'];
    const outcomes = await Promise.all(
      alternatives.map((password, i) =>
        send(
          { currentPassword: account.password, newPassword: password },
          i ? second.accessToken : login.accessToken,
        ),
      ),
    );
    expect(outcomes.filter((result) => result.status === 204)).toHaveLength(1);
    expect(
      outcomes.filter((result) => [401, 422].includes(result.status)),
    ).toHaveLength(1);
    const winner = outcomes.findIndex((result) => result.status === 204);
    expect(
      (
        await sessions.login.execute({
          ...account,
          password: alternatives[winner]!,
        })
      ).identity.user.email,
    ).toBe(account.email);
    await expect(
      sessions.login.execute({
        ...account,
        password: alternatives[1 - winner]!,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
  it('blocks an old-password login that verified before the change but inserts its session afterwards', async () => {
    const verifier = await Argon2PasswordVerifier.create();
    let resume!: () => void, reached!: () => void;
    const gate = new Promise<void>((resolveGate) => {
      resume = resolveGate;
    });
    const verified = new Promise<void>((resolveVerified) => {
      reached = resolveVerified;
    });
    const delayed = new Login(
      new MongoSessionStore(models, sessionModel),
      {
        verify: async (hash, password) => {
          const valid = await verifier.verify(hash, password);
          reached();
          await gate;
          return valid;
        },
      },
      new JoseSessionTokens(secret),
      { now: () => now },
    );
    const pending = delayed.execute(account);
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await verified;
    expect((await send()).status).toBe(204);
    resume();
    await rejection;
    expect(await sessionModel.countDocuments({ revokedAt: null })).toBe(0);
  });
  it('never leaves a live old-credential refresh after concurrent rotation and change', async () => {
    const current = await scope();
    const outcomes = await Promise.allSettled([
      sessions.refresh.execute(login.refreshToken),
      change.service.execute(current, {
        currentPassword: account.password,
        newPassword,
      }),
    ]);
    expect(outcomes[1]!.status).toBe('fulfilled');
    if (outcomes[0]!.status === 'fulfilled')
      await expect(
        sessions.authenticate.execute(outcomes[0]!.value.accessToken),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await sessionModel.countDocuments({ revokedAt: null })).toBe(0);
  });
  it.each(['logout', 'suspended', 'expired', 'membership', 'reset'] as const)(
    'rejects %s after verification but before commit',
    async (cause) => {
      const current = await scope();
      const delayed = new ChangePassword(
        change.store,
        await Argon2PasswordVerifier.create(),
        {
          hash: async (password) => {
            if (cause === 'logout')
              await sessions.logout.execute(login.refreshToken);
            if (cause === 'suspended')
              await models.User.updateOne(
                { _id: current.userId },
                { $set: { status: 'suspended' } },
              );
            if (cause === 'expired')
              now = new Date(login.refreshExpiresAt.getTime());
            if (cause === 'membership')
              await models.Membership.deleteMany({ user: current.userId });
            if (cause === 'reset')
              await recovery.service.reset(
                await issue(),
                'reset won before signed in change',
              );
            return new Argon2PasswordHasher().hash(password);
          },
        },
        { now: () => now },
      );
      await expect(
        delayed.execute(current, {
          currentPassword: account.password,
          newPassword,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      const hash = (await models.User.findById(current.userId)
        .select('+passwordHash')
        .lean())!.passwordHash;
      expect(
        await (
          await Argon2PasswordVerifier.create()
        ).verify(hash ?? null, newPassword),
      ).toBe(false);
    },
  );
});
