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
import { connectDatabase } from '../src/main/database.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { Login } from '../src/modules/auth/application/login.js';
import { PasswordRecovery } from '../src/modules/auth/application/password-recovery.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { Argon2PasswordVerifier } from '../src/modules/auth/infrastructure/argon2-password-verifier.js';
import { JoseSessionTokens } from '../src/modules/auth/infrastructure/jose-session-tokens.js';
import { MongoSessionStore } from '../src/modules/auth/infrastructure/mongo-session-store.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import { EncryptedRecoverySecrets } from '../src/modules/auth/infrastructure/recovery-secrets.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
const origin = 'http://localhost:3000',
  secret = 'test-recovery-secret-at-least-thirty-two-characters';
const account = {
  name: 'Ahmed',
  email: 'ahmed@example.com',
  password: 'a secure password for tests',
};
const newPassword = 'new secure password for recovery';
describe('Password recovery: delivery, reset and session races', () => {
  let replica: MongoMemoryReplSet,
    database: Awaited<ReturnType<typeof connectDatabase>>;
  let users: ReturnType<typeof createRegistrationModels>,
    sessionsModel: ReturnType<typeof createSessionModel>;
  let sessions: Awaited<ReturnType<typeof createAuthentication>>,
    recovery: Awaited<ReturnType<typeof createPasswordRecovery>>;
  let register: RegisterAccount, app: ReturnType<typeof createApp>, now: Date;
  const sent: { email: string; token: string; id: string }[] = [];
  const mailer = {
    send: vi.fn(async (email: string, token: string, id: string) => {
      sent.push({ email, token, id });
    }),
  };
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
    database = await connectDatabase(replica.getUri('password-recovery'));
    users = createRegistrationModels(database);
    await initializeRegistrationModels(users);
    sessionsModel = createSessionModel(database);
    await sessionsModel.createCollection();
    await sessionsModel.createIndexes();
    sessions = await createAuthentication(users, sessionsModel, secret, false, {
      now: () => now,
    });
    recovery = await createPasswordRecovery(
      users.User,
      sessionsModel,
      secret,
      mailer,
      { now: () => now },
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, users),
      new Argon2PasswordHasher(),
    );
  }, 240_000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    sent.length = 0;
    mailer.send.mockReset();
    mailer.send.mockImplementation(async (email, token, id) => {
      sent.push({ email, token, id });
    });
    now = new Date();
    await recovery.models.Job.deleteMany({});
    await recovery.models.Mailbox.deleteMany({});
    await sessionsModel.deleteMany({});
    await users.Membership.deleteMany({});
    await users.Workspace.deleteMany({});
    await users.User.deleteMany({});
    await register.execute(account);
    app = createApp(origin, { sessions, passwordRecovery: recovery.service });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replica?.stop();
  });
  function forgot(email = account.email) {
    return request(app)
      .post('/api/v1/auth/forgot-password')
      .set('Origin', origin)
      .send({ email });
  }
  function reset(token: string, password = newPassword) {
    return request(app)
      .post('/api/v1/auth/reset-password')
      .set('Origin', origin)
      .send({ token, password });
  }
  async function issue(email = account.email) {
    await recovery.service.request(email);
    expect(await recovery.service.deliverNext()).toBe(true);
    return sent.at(-1)!.token;
  }
  it('returns identical accepted bodies for active, missing and suspended accounts without inline account lookup or sending', async () => {
    await users.User.create({
      name: 'Suspended',
      email: 'suspended@example.com',
      passwordHash: 'hash',
      status: 'suspended',
    });
    const lookup = vi.spyOn(users.User, 'findOne');
    const results = await Promise.all([
      forgot(' AHMED@Example.COM '),
      forgot('missing@example.com'),
      forgot('suspended@example.com'),
    ]);
    expect(lookup).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
    for (const response of results) {
      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        success: true,
        data: { accepted: true },
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    while (await recovery.service.deliverNext()) {
      /* Drain the durable queue. */
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]?.email).toBe(account.email);
  });
  it('encrypts queued email and token, retains a digest only after delivery, and does not persist plaintext', async () => {
    await recovery.service.request(account.email);
    const job = await recovery.models.Job.findOne({}).select('+payload').lean();
    expect(job).not.toBeNull();
    const decoded = new EncryptedRecoverySecrets(secret).open(job!.payload);
    expect(JSON.stringify(job)).not.toContain(account.email);
    expect(JSON.stringify(job)).not.toContain(decoded.token);
    expect(new EncryptedRecoverySecrets(secret).digest(decoded.token)).toBe(
      job!._id,
    );
    await recovery.service.deliverNext();
    const done = await recovery.models.Job.findById(job!._id)
      .select('+payload')
      .lean();
    expect(done?.payload).toBe('');
    expect(done?.done).toBe(true);
  });
  it('enforces normalized mailbox cooldown across origins/IPs and does not invalidate an existing link', async () => {
    const token = await issue();
    await Promise.all(
      Array.from({ length: 6 }, () =>
        recovery.service.request(' AHMED@Example.COM '),
      ),
    );
    expect(await recovery.models.Job.countDocuments()).toBe(1);
    expect((await reset(token)).status).toBe(204);
  });
  it('caps a mailbox to five hourly requests and reopens the window after one hour', async () => {
    for (let i = 0; i < 8; i++) {
      await recovery.service.request(account.email);
      now = new Date(now.getTime() + 60_000);
    }
    expect(await recovery.models.Job.countDocuments()).toBe(5);
    now = new Date(now.getTime() + 3_600_000);
    await recovery.service.request(account.email);
    expect(await recovery.models.Job.countDocuments()).toBe(6);
  });
  it('survives process/service recreation and retries ambiguous delivery with the same token and delivery ID', async () => {
    mailer.send.mockRejectedValueOnce(new Error('provider secret failure'));
    await recovery.service.request(account.email);
    expect(await recovery.service.deliverNext()).toBe(true);
    expect(sent).toHaveLength(0);
    expect(await recovery.service.deliverNext()).toBe(false);
    now = new Date(now.getTime() + 30_001);
    const restarted = await createPasswordRecovery(
      users.User,
      sessionsModel,
      secret,
      mailer,
      { now: () => now },
    );
    await restarted.service.deliverNext();
    expect(sent).toHaveLength(1);
    expect(mailer.send.mock.calls[0]).toEqual(mailer.send.mock.calls[1]);
  });
  it('leases a queued job to just one worker and recovers an abandoned lease', async () => {
    await recovery.service.request(account.email);
    const jobs = await Promise.all([
      recovery.store.claim('one', now),
      recovery.store.claim('two', now),
    ]);
    expect(jobs.filter(Boolean)).toHaveLength(1);
    expect(await recovery.store.claim('three', now)).toBeNull();
    now = new Date(now.getTime() + 30_000);
    expect(await recovery.store.claim('three', now)).not.toBeNull();
  });
  it('resets once, rejects the old password, permits the new one and revokes access/refresh for every workspace session', async () => {
    const first = await sessions.login.execute(account);
    const user = await users.User.findOne({ email: account.email }).lean();
    const workspace = await users.Workspace.create({
      name: 'Another workspace',
      slug: 'another-test-workspace',
      owner: user!._id,
    });
    await users.Membership.create({
      user: user!._id,
      workspace: workspace._id,
      role: 'owner',
    });
    const second = await sessions.login.execute({
      ...account,
      workspaceId: workspace._id.toHexString(),
    });
    expect(first.identity.workspace.id).not.toBe(second.identity.workspace.id);
    const token = await issue();
    expect((await reset(token)).status).toBe(204);
    expect(
      (await reset(token, 'another secure recovery password')).body.error.code,
    ).toBe('RECOVERY_INVALID');
    for (const login of [first, second]) {
      await expect(
        sessions.authenticate.execute(login.accessToken),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(
        sessions.refresh.execute(login.refreshToken),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
    await expect(sessions.login.execute(account)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(
      (await sessions.login.execute({ ...account, password: newPassword }))
        .identity.user.email,
    ).toBe(account.email);
  });
  it('preserves another account sessions and credentials', async () => {
    const other = { ...account, email: 'other@example.com' };
    await register.execute(other);
    const login = await sessions.login.execute(other);
    await reset(await issue());
    expect(
      (await sessions.authenticate.execute(login.accessToken)).user.email,
    ).toBe(other.email);
    expect((await sessions.login.execute(other)).identity.user.email).toBe(
      other.email,
    );
  });
  it('rejects expired tokens at exactly thirty minutes even before TTL cleanup', async () => {
    const token = await issue();
    now = new Date(now.getTime() + 30 * 60_000);
    expect(await recovery.models.Job.countDocuments()).toBe(1);
    expect((await reset(token)).body.error.code).toBe('RECOVERY_INVALID');
    expect((await sessions.login.execute(account)).identity.user.email).toBe(
      account.email,
    );
  });
  it.each([
    '',
    'x'.repeat(42),
    'x'.repeat(44),
    'a'.repeat(43),
    '../secret',
    'x'.repeat(101),
  ])('rejects malformed/unknown token %s', async (token) => {
    expect((await reset(token)).status).toBe(422);
  });
  it.each(['short', 'x'.repeat(129)])(
    'rejects password policy violations without consuming the token',
    async (password) => {
      const token = await issue();
      expect((await reset(token, password)).body.error.code).toBe(
        'VALIDATION_ERROR',
      );
      expect((await reset(token)).status).toBe(204);
    },
  );
  it('uses Unicode codepoints without trimming the new password', async () => {
    const password = ' ' + '🔑'.repeat(15) + ' ';
    expect((await reset(await issue(), password)).status).toBe(204);
    expect(
      (await sessions.login.execute({ ...account, password })).identity.user
        .email,
    ).toBe(account.email);
    await expect(
      sessions.login.execute({ ...account, password: password.trim() }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
  it('invalidates sibling links, including an earlier queued job not yet delivered, after a successful reset', async () => {
    const token = await issue();
    now = new Date(now.getTime() + 60_001);
    await recovery.service.request(account.email);
    now = new Date(now.getTime() + 1);
    await reset(token);
    await recovery.service.deliverNext();
    expect(sent).toHaveLength(1);
    now = new Date(now.getTime() + 60_001);
    const next = await issue();
    expect((await reset(next, 'third secure password for tests')).status).toBe(
      204,
    );
  });
  it('consumes all previously delivered sibling links while allowing the first valid link to reset', async () => {
    const first = await issue();
    now = new Date(now.getTime() + 60_001);
    const second = await issue();
    expect(first).not.toBe(second);
    expect((await reset(first)).status).toBe(204);
    expect((await reset(second)).body.error.code).toBe('RECOVERY_INVALID');
  });
  it('supports existing accounts without the newly introduced fence fields', async () => {
    await users.User.collection.updateOne(
      { email: account.email },
      { $unset: { authFence: '', passwordChangedAt: '' } },
    );
    const old = await sessions.login.execute(account);
    expect((await reset(await issue())).status).toBe(204);
    await expect(
      sessions.authenticate.execute(old.accessToken),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(
      (await sessions.login.execute({ ...account, password: newPassword }))
        .identity.user.email,
    ).toBe(account.email);
  });
  it('allows exactly one concurrent reset and never leaves both new passwords valid', async () => {
    const token = await issue(),
      alternatives = [newPassword, 'other competing recovery password'];
    const results = await Promise.all(
      alternatives.map((password) => reset(token, password)),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      204, 422,
    ]);
    const winner =
      alternatives[results.findIndex((response) => response.status === 204)]!;
    expect(
      (await sessions.login.execute({ ...account, password: winner })).identity
        .user.email,
    ).toBe(account.email);
  });
  it('rolls back password, consumption and revocation together when a session write fails', async () => {
    const login = await sessions.login.execute(account),
      token = await issue();
    const fault = vi
      .spyOn(sessionsModel, 'updateMany')
      .mockRejectedValueOnce(new Error('write failed'));
    expect((await reset(token)).status).toBe(500);
    fault.mockRestore();
    expect(
      (await sessions.authenticate.execute(login.accessToken)).user.email,
    ).toBe(account.email);
    expect((await sessions.login.execute(account)).identity.user.email).toBe(
      account.email,
    );
    expect((await reset(token)).status).toBe(204);
  });
  it('blocks an old-password login that verified credentials before reset but inserts its session afterwards', async () => {
    const token = await issue(),
      store = new MongoSessionStore(users, sessionsModel),
      tokens = new JoseSessionTokens(secret);
    const verifier = await Argon2PasswordVerifier.create();
    let continueLogin!: () => void, reached!: () => void;
    const waiting = new Promise<void>((resolve) => {
        continueLogin = resolve;
      }),
      verified = new Promise<void>((resolve) => {
        reached = resolve;
      });
    const login = new Login(
      store,
      {
        verify: async (hash, password) => {
          const valid = await verifier.verify(hash, password);
          reached();
          await waiting;
          return valid;
        },
      },
      tokens,
      { now: () => now },
    );
    const pending = login.execute(account);
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await verified;
    await reset(token);
    continueLogin();
    await rejected;
    expect(await sessionsModel.countDocuments({ revokedAt: null })).toBe(0);
  });
  it('never yields a live pre-reset refresh session when rotation and reset race', async () => {
    const login = await sessions.login.execute(account),
      token = await issue();
    const outcomes = await Promise.allSettled([
      sessions.refresh.execute(login.refreshToken),
      recovery.service.reset(token, newPassword),
    ]);
    expect(outcomes[1]?.status).toBe('fulfilled');
    const rotation = outcomes[0];
    if (rotation?.status === 'fulfilled')
      await expect(
        sessions.authenticate.execute(rotation.value.accessToken),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await sessionsModel.countDocuments({ revokedAt: null })).toBe(0);
  });
  it('does not consume or activate recovery for a user suspended/deleted after issuance', async () => {
    const token = await issue();
    await users.User.updateOne(
      { email: account.email },
      { $set: { status: 'suspended' } },
    );
    expect((await reset(token)).body.error.code).toBe('RECOVERY_INVALID');
  });
  it('does not allow token use before a worker binds it to an eligible account', async () => {
    await recovery.service.request(account.email);
    const job = await recovery.models.Job.findOne({}).select('+payload').lean();
    const token = new EncryptedRecoverySecrets(secret).open(job!.payload).token;
    expect((await reset(token)).body.error.code).toBe('RECOVERY_INVALID');
  });
  it('requires the trusted origin and strict schemas without accepting user/workspace/role fields', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/forgot-password')
          .send({ email: account.email })
      ).status,
    ).toBe(403);
    for (const body of [
      { email: account.email, userId: 'bad' },
      { email: 'invalid' },
      { email: 42 },
    ])
      expect(
        (
          await request(app)
            .post('/api/v1/auth/forgot-password')
            .set('Origin', origin)
            .send(body)
        ).status,
      ).toBe(422);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .set('Origin', 'https://evil.example')
          .send({ token: 'a'.repeat(43), password: newPassword })
      ).status,
    ).toBe(403);
  });
  it('rate limits requests before queueing, consistently for missing accounts too', async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await forgot('missing@example.com')).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(202));
    expect(statuses[10]).toBe(429);
    expect(await recovery.models.Job.countDocuments()).toBe(1);
  });
  it('leaves authenticated identity reads available without a request Origin header', async () => {
    const login = await sessions.login.execute(account);
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer ' + login.accessToken);
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(account.email);
  });
  it('reports recovery configuration unavailable consistently instead of pretending to send', async () => {
    const unavailable = new PasswordRecovery(
      recovery.store,
      new EncryptedRecoverySecrets(secret),
      new Argon2PasswordHasher(),
      null,
      { now: () => now },
    );
    app = createApp(origin, { passwordRecovery: unavailable });
    for (const email of [account.email, 'missing@example.com']) {
      const response = await forgot(email);
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('RECOVERY_UNAVAILABLE');
    }
    expect(await recovery.models.Job.countDocuments()).toBe(0);
  });
});
