import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { connectDatabase } from '../src/main/database.js';
import { createApp } from '../src/main/create-app.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { MongoWelcomeStore } from '../src/modules/auth/infrastructure/mongo-welcome-store.js';
import { WelcomeEmail } from '../src/modules/auth/application/welcome-email.js';
import { WelcomeDeliveryError } from '../src/modules/auth/application/ports/welcome-email.js';
import type { WelcomeMailer } from '../src/modules/auth/application/ports/welcome-email.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';

const origin = 'http://localhost:3000';
const input = {
  name: 'Omar',
  email: 'person@example.com',
  password: 'a secure welcome test password',
  workspaceName: 'Omar Studio',
  locale: 'ar',
};
describe('durable welcome delivery', () => {
  let replica: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let sessions: ReturnType<typeof createSessionModel>;
  let auth: Awaited<ReturnType<typeof createAuthentication>>;
  let app: ReturnType<typeof createApp>;
  let store: MongoWelcomeStore;
  let now: Date;
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({
      binary: {
        ...mongoBinaryOptions(),
        downloadDir: resolve('../../.cache/mongodb-binaries'),
      },
      replSet: { count: 1 },
    });
    database = await connectDatabase(replica.getUri('welcome-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessions = createSessionModel(database);
    await sessions.createCollection();
    await sessions.createIndexes();
    auth = await createAuthentication(
      models,
      sessions,
      'welcome-test-signing-secret-at-least-32-characters',
      false,
      { now: () => now },
      true,
    );
    app = createApp(origin, { sessions: auth, registerAccount: auth.register });
    store = new MongoWelcomeStore(models.User);
  }, 240000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    now = new Date();
    for (const collection of Object.values(database.collections))
      await collection.deleteMany({});
  });
  afterAll(async () => {
    await database?.close();
    await replica?.stop();
  });
  const signup = () =>
    request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(input);
  const worker = (mailer: WelcomeMailer | null) =>
    new WelcomeEmail(store, mailer, { now: () => now });
  it('queues one localized welcome with registration, keeps it private, and leases once across workers', async () => {
    const result = await signup();
    expect(result.status).toBe(201);
    expect(JSON.stringify(result.body)).not.toContain('welcomeEmail');
    expect((await models.User.findOne().lean())?.welcomeEmail).toBeUndefined();
    expect(
      (await models.User.findOne().select('+welcomeEmail').orFail())
        .welcomeEmail,
    ).toMatchObject({
      state: 'pending',
      language: 'ar',
      workspaceName: 'Omar Studio',
    });
    const send = vi.fn<WelcomeMailer['send']>().mockResolvedValue(undefined);
    expect(send).not.toHaveBeenCalled();
    await Promise.all([
      worker({ send }).deliverNext(),
      worker({ send }).deliverNext(),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toBe(
      `welcome/${result.body.data.user.id}/v1`,
    );
    expect(await worker({ send }).deliverNext()).toBe(false);
    expect(
      (await models.User.findOne().select('+welcomeEmail').orFail())
        .welcomeEmail?.state,
    ).toBe('sent');
  });
  it('retries transient errors with the same frozen content and does not affect sign-in', async () => {
    const result = await signup();
    const send = vi
      .fn<WelcomeMailer['send']>()
      .mockRejectedValueOnce(new Error('private-network-error'))
      .mockResolvedValue(undefined);
    expect(await worker({ send }).deliverNext()).toBe(true);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${result.body.data.accessToken}`)
      ).status,
    ).toBe(200);
    expect(await worker({ send }).deliverNext()).toBe(false);
    await models.User.updateOne({}, { $set: { name: 'Changed name' } });
    now = new Date(now.getTime() + 31000);
    expect(await worker({ send }).deliverNext()).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![1]).toBe(send.mock.calls[1]![1]);
    expect(send.mock.calls[1]![0].name).toBe('Omar');
  });
  it('keeps the same delivery key after a lost database acknowledgement', async () => {
    await signup();
    const deliveries = new Set<string>();
    const send = vi
      .fn<WelcomeMailer['send']>()
      .mockImplementation(async (_message, id) => {
        deliveries.add(id);
      });
    vi.spyOn(store, 'finish').mockRejectedValueOnce(
      new Error('private-database-failure'),
    );
    await worker({ send }).deliverNext();
    now = new Date(now.getTime() + 31000);
    await worker({ send }).deliverNext();
    expect(send).toHaveBeenCalledTimes(2);
    expect(deliveries.size).toBe(1);
  });
  it('does not enqueue old accounts or accounts created while disabled', async () => {
    const disabled = await createAuthentication(
      models,
      sessions,
      'welcome-test-signing-secret-at-least-32-characters',
      false,
      { now: () => now },
    );
    await disabled.register.execute({ ...input, locale: 'en' });
    const send = vi.fn<WelcomeMailer['send']>();
    expect(await worker({ send }).deliverNext()).toBe(false);
    expect(
      (await models.User.findOne().select('+welcomeEmail').orFail())
        .welcomeEmail,
    ).toBeNull();
    expect(await worker(null).deliverNext()).toBe(false);
  });
  it('does not send after the idempotency window, to suspended users, or after recipient changes', async () => {
    await signup();
    const send = vi.fn<WelcomeMailer['send']>();
    await models.User.updateOne({}, { $set: { status: 'suspended' } });
    expect(await worker({ send }).deliverNext()).toBe(false);
    await models.User.updateOne(
      {},
      { $set: { status: 'active', email: 'changed@example.com' } },
    );
    expect(await worker({ send }).deliverNext()).toBe(false);
    await models.User.updateOne({}, { $set: { email: input.email } });
    now = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    expect(await worker({ send }).deliverNext()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('stops retrying permanent provider failures', async () => {
    await signup();
    const send = vi
      .fn<WelcomeMailer['send']>()
      .mockRejectedValue(new WelcomeDeliveryError(false));
    await worker({ send }).deliverNext();
    now = new Date(now.getTime() + 60000);
    expect(await worker({ send }).deliverNext()).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (await models.User.findOne().select('+welcomeEmail').orFail())
        .welcomeEmail?.state,
    ).toBe('failed');
  });
});
