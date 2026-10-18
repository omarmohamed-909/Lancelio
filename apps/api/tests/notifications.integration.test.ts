import { resolve } from 'node:path';
import { Types } from 'mongoose';
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
import { createNotifications } from '../src/main/create-notifications.js';
import { connectDatabase } from '../src/main/database.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { createNotificationStateModel } from '../src/modules/notifications/infrastructure/notification-state-model.js';
import { EncodedNotificationCursors } from '../src/modules/notifications/infrastructure/notification-cursors.js';
import {
  validateNotificationId,
  validateNotificationVersion,
} from '../src/modules/notifications/domain/notification.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
const account = {
  name: 'Inbox Owner',
  email: 'inbox@example.com',
  password: 'a long secure inbox test password',
  workspaceName: 'Inbox Studio',
};
const names = {
  proposals: 'inbox_proposals',
  invoices: 'inbox_invoices',
  payments: 'inbox_payments',
};
const date = new Date('2026-09-01T12:00:00.000Z');
describe('Committed notifications and independent member read state', () => {
  let replica: MongoMemoryReplSet,
    database: Awaited<ReturnType<typeof connectDatabase>>,
    models: ReturnType<typeof createRegistrationModels>,
    sessionModel: ReturnType<typeof createSessionModel>,
    states: ReturnType<typeof createNotificationStateModel>,
    auth: Awaited<ReturnType<typeof createAuthentication>>,
    register: RegisterAccount,
    service: ReturnType<typeof createNotifications>,
    app: ReturnType<typeof createApp>,
    workspace: string,
    user: string,
    token: string,
    clock: Date;
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
    database = await connectDatabase(replica.getUri('notification-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    states = createNotificationStateModel(database);
    for (const model of [sessionModel, states]) {
      await model.createCollection();
      await model.createIndexes();
    }
    for (const name of Object.values(names))
      await database.db!.createCollection(name);
    auth = await createAuthentication(
      models,
      sessionModel,
      'inbox-test-signing-secret-at-least-32-characters',
      false,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    service = createNotifications(database, states, names, () => clock);
  }, 240000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    clock = new Date();
    await Promise.all([
      states.deleteMany({}),
      sessionModel.deleteMany({}),
      models.User.deleteMany({}),
      models.Workspace.deleteMany({}),
      models.Membership.deleteMany({}),
      ...Object.values(names).map((name) =>
        database.db!.collection(name).deleteMany({}),
      ),
    ]);
    await register.execute(account);
    const login = await auth.login.execute(account);
    workspace = login.identity.workspace.id;
    user = login.identity.user.id;
    token = login.accessToken;
    app = createApp('http://localhost:3000', {
      sessions: auth,
      notifications: service,
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replica?.stop();
  });
  const list = (query = '') =>
    request(app)
      .get('/api/v1/notifications' + query)
      .set('Authorization', 'Bearer ' + token);
  const write = (id: string, version = 0, read = true) =>
    request(app)
      .post('/api/v1/notifications/' + id + '/read')
      .set('Authorization', 'Bearer ' + token)
      .send({ version, read });
  async function invoice(scope = workspace, at = date, status = 'issued') {
    const id = new Types.ObjectId();
    await database.db!.collection(names.invoices).insertOne({
      _id: id,
      workspace: new Types.ObjectId(scope),
      status,
      issuedAt: at,
      title: 'Invoice title',
      PRIVATE: 'secret',
      requestId: 'PRIVATE',
    });
    return id;
  }
  async function proposal(outcome = 'accepted', scope = workspace, at = date) {
    const id = new Types.ObjectId();
    await database.db!.collection(names.proposals).insertOne({
      _id: id,
      workspace: new Types.ObjectId(scope),
      title: 'Proposal title',
      status: outcome,
      decision: { outcome, at, requestId: 'PRIVATE' },
      shareDigest: 'PRIVATE',
    });
    return id;
  }
  async function payment(
    invoiceId: Types.ObjectId,
    scope = workspace,
    voided = true,
  ) {
    const id = new Types.ObjectId();
    await database.db!.collection(names.payments).insertOne({
      workspace: new Types.ObjectId(scope),
      invoice: invoiceId,
      entries: [
        {
          _id: id,
          createdAt: date,
          voidedAt: voided ? new Date(date.getTime() + 1000) : null,
          amountMinor: 100,
          reference: 'PRIVATE',
          memo: 'PRIVATE',
          voidReason: 'PRIVATE',
          requestId: 'PRIVATE',
        },
      ],
    });
    return id;
  }
  it('empty inbox has virtual read state and no writes; endpoints are private/no-store', async () => {
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
    const response = await list();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.data).toEqual({
      items: [],
      unreadCount: 0,
      nextCursor: null,
      asOf: clock.toISOString(),
    });
    expect(await states.countDocuments()).toBe(0);
    const summary = await list('/summary');
    expect(summary.body.data.unreadCount).toBe(0);
  });
  it('derives all five committed event kinds and explicit DTOs, preserving received history after void', async () => {
    await proposal();
    await proposal('rejected');
    const inv = await invoice();
    await payment(inv);
    const response = await list();
    expect(response.status).toBe(200);
    const rows = response.body.data.items;
    expect(response.body.data.unreadCount).toBe(5);
    expect(rows.map((row: { kind: string }) => row.kind).sort()).toEqual([
      'invoice_issued',
      'payment_received',
      'payment_voided',
      'proposal_accepted',
      'proposal_rejected',
    ]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        [
          'id',
          'kind',
          'title',
          'occurredAt',
          'target',
          'read',
          'readAt',
          'version',
        ].sort(),
      );
      expect(row).toMatchObject({ read: false, readAt: null, version: 0 });
    }
    expect(rows[0].kind).toBe('payment_voided');
    expect(JSON.stringify(rows)).not.toContain('PRIVATE');
    expect(await states.countDocuments()).toBe(0);
  });
  it('does not invent events for drafts, missing dates or inconsistent proposal decisions', async () => {
    const inv = await invoice(workspace, date, 'draft');
    await payment(inv);
    const id = await proposal();
    await database
      .db!.collection(names.proposals)
      .updateOne({ _id: id }, { $set: { status: 'shared' } });
    const issued = await invoice();
    await database
      .db!.collection(names.invoices)
      .updateOne({ _id: issued }, { $unset: { issuedAt: '' } });
    expect((await list()).body.data.items).toEqual([]);
  });
  it('isolates every source and receipt by workspace, excluding orphan/foreign invoice payment ledgers', async () => {
    const foreign = new Types.ObjectId().toHexString();
    await proposal('accepted', foreign);
    const outside = await invoice(foreign);
    await payment(outside);
    await payment(outside, foreign);
    await payment(new Types.ObjectId());
    const local = await invoice();
    await states.create({
      workspace: foreign,
      user,
      eventId: 'invoice:' + local + ':issued',
      read: true,
      readAt: date,
      version: 99,
    });
    expect((await list()).body.data.items).toEqual([
      expect.objectContaining({
        id: 'invoice:' + local + ':issued',
        read: false,
        version: 0,
      }),
    ]);
    expect((await write('invoice:' + outside + ':issued')).status).toBe(404);
  });
  it('creates one receipt, preserves no-op timestamps, clears unread time and increments subsequent read revision', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    const first = await write(id);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({
      id,
      read: true,
      readAt: clock.toISOString(),
      version: 1,
    });
    clock = new Date(clock.getTime() + 10000);
    const same = await write(id, 1);
    expect(same.body.data).toEqual(first.body.data);
    const unread = await write(id, 1, false);
    expect(unread.body.data).toEqual({
      id,
      read: false,
      readAt: null,
      version: 2,
    });
    const again = await write(id, 2);
    expect(again.body.data.readAt).toBe(clock.toISOString());
    expect(again.body.data.version).toBe(3);
    expect(await states.countDocuments()).toBe(1);
  });
  it('unread no-op stays virtual revision zero and does not create a receipt', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    expect((await write(id, 0, false)).body.data.version).toBe(0);
    expect(await states.countDocuments()).toBe(0);
  });
  it('rejects a stale revision and never silently overwrites another read change', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    await write(id);
    expect((await write(id, 0, false)).status).toBe(409);
    expect((await list()).body.data.items[0].read).toBe(true);
  });
  it('concurrent first read requests create only one receipt', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    const results = await Promise.all([write(id), write(id)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await states.countDocuments()).toBe(1);
  });
  it('concurrent existing-receipt unread requests cannot both advance the revision', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    await write(id);
    const results = await Promise.all([
      write(id, 1, false),
      write(id, 1, false),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((await list()).body.data.items[0].version).toBe(2);
  });
  it('two members have independent state in the same workspace', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    await write(id);
    const second = new Types.ObjectId().toHexString();
    expect(
      (await service.list(workspace, second, false, null)).items[0],
    ).toMatchObject({ read: false, version: 0 });
    await service.setRead(workspace, second, id, 0, true);
    await write(id, 1, false);
    expect((await service.summary(workspace, second)).unreadCount).toBe(0);
    expect((await service.summary(workspace, user)).unreadCount).toBe(1);
  });
  it('reads new committed events on refresh without resetting previous receipts', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    await write(id);
    await proposal();
    const result = await list();
    expect(result.body.data.unreadCount).toBe(1);
    expect(
      result.body.data.items.find((row: { id: string }) => row.id === id).read,
    ).toBe(true);
  });
  it('revoked membership blocks both inbox reads and receipt writes on the existing access token', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    await models.Membership.deleteMany({ user });
    expect((await list()).status).toBe(401);
    expect((await write(id)).status).toBe(401);
    expect(await states.countDocuments()).toBe(0);
  });
  it('does not mutate the original issued invoice or decision while marking a notification', async () => {
    const invoiceId = await invoice(),
      proposalId = await proposal();
    const beforeInvoice = await database
        .db!.collection(names.invoices)
        .findOne({ _id: invoiceId }),
      beforeProposal = await database
        .db!.collection(names.proposals)
        .findOne({ _id: proposalId });
    await write('invoice:' + invoiceId + ':issued');
    await write('proposal:' + proposalId + ':accepted');
    expect(
      await database.db!.collection(names.invoices).findOne({ _id: invoiceId }),
    ).toEqual(beforeInvoice);
    expect(
      await database
        .db!.collection(names.proposals)
        .findOne({ _id: proposalId }),
    ).toEqual(beforeProposal);
  });
  it('paginates 60 timestamp ties across four sources without omissions or duplication and keeps global unread count', async () => {
    for (let i = 0; i < 15; i++) {
      await proposal(i % 2 ? 'accepted' : 'rejected');
      const inv = await invoice();
      await payment(inv, workspace, false);
    }
    for (let i = 0; i < 15; i++) await invoice();
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await list(cursor ? '?cursor=' + cursor : '');
      const data = response.body.data;
      expect(data.unreadCount).toBe(60);
      expect(data.items.length).toBeLessThanOrEqual(25);
      ids.push(...data.items.map((row: { id: string }) => row.id));
      cursor = data.nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    expect(ids).toEqual([...ids].sort().reverse());
    await write(ids[0]!);
    const unread = await list('?filter=unread');
    expect(unread.body.data.unreadCount).toBe(59);
    expect(
      unread.body.data.items.every((row: { read: boolean }) => !row.read),
    ).toBe(true);
    expect(
      unread.body.data.items.map((row: { id: string }) => row.id),
    ).not.toContain(ids[0]);
  });
  it('uses one snapshot across sources when an invoice commits between proposal and invoice reads', async () => {
    await proposal();
    const source = database.db!.collection(names.proposals);
    const aggregate = source.aggregate.bind(source);
    vi.spyOn(database.db!, 'collection').mockReturnValueOnce(source);
    vi.spyOn(source, 'aggregate').mockImplementationOnce(
      (pipeline, options) => {
        const cursor = aggregate(pipeline, options);
        const toArray = cursor.toArray.bind(cursor);
        vi.spyOn(cursor, 'toArray').mockImplementationOnce(async () => {
          const rows = await toArray();
          await invoice();
          return rows;
        });
        return cursor;
      },
    );
    const first = await list();
    expect(first.body.data.items).toHaveLength(1);
    expect(first.body.data.unreadCount).toBe(1);
    expect((await list()).body.data.unreadCount).toBe(2);
  });
  it('cursor never supplies workspace authority', async () => {
    const foreign = new Types.ObjectId().toHexString();
    const local = await invoice(),
      outside = await invoice(foreign);
    const cursor = new EncodedNotificationCursors().encode({
      at: date,
      id: 'invoice:' + outside + ':issued',
    });
    const result = await list('?cursor=' + cursor);
    expect(result.status).toBe(200);
    expect(result.body.data.unreadCount).toBe(1);
    expect(
      result.body.data.items.every(
        (row: { target: { id: string } }) =>
          row.target.id === local.toHexString(),
      ),
    ).toBe(true);
  });
  it('missing source returns 404 without orphan receipts', async () => {
    expect(
      (await write('invoice:' + new Types.ObjectId() + ':issued')).status,
    ).toBe(404);
    expect(await states.countDocuments()).toBe(0);
  });
  it('storage read failure produces an error instead of an empty inbox/count', async () => {
    vi.spyOn(database, 'startSession').mockRejectedValueOnce(
      new Error('PRIVATE failure'),
    );
    const result = await list();
    expect(result.status).toBe(500);
    expect(result.body.data).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('PRIVATE');
  });
  it('receipt write failure leaves no receipt and existing notification remains unread', async () => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    vi.spyOn(states, 'create').mockRejectedValueOnce(new Error('failed'));
    expect((await write(id)).status).toBe(500);
    expect(await states.countDocuments()).toBe(0);
    expect((await list()).body.data.unreadCount).toBe(1);
  });
  it.each([
    '?workspace=other',
    '?user=other',
    '?filter=read',
    '?filter=all&filter=unread',
    '?cursor=',
    '?cursor=invalid',
    '/summary?filter=all',
  ])('rejects invalid/authority query %s', async (query) => {
    expect((await list(query)).status).toBe(422);
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid revision %s',
    async (version) => {
      const id = 'invoice:' + (await invoice()) + ':issued';
      expect((await write(id, version)).status).toBe(422);
    },
  );
  it.each([
    { read: 'true', version: 0 },
    { read: true, version: 0, workspace: 'other' },
    { read: true },
    { read: true, version: '0' },
  ])('strict body rejects %j', async (body) => {
    const id = 'invoice:' + (await invoice()) + ':issued';
    expect(
      (
        await request(app)
          .post('/api/v1/notifications/' + id + '/read')
          .set('Authorization', 'Bearer ' + token)
          .send(body)
      ).status,
    ).toBe(422);
  });
});
describe('Notification cursor and identity contract', () => {
  const codec = new EncodedNotificationCursors(),
    id = 'invoice:' + 'a'.repeat(24) + ':issued';
  it('round trips canonical timestamp and event identity', () => {
    expect(codec.decode(codec.encode({ at: date, id }))).toEqual({
      at: date,
      id,
    });
  });
  it.each([
    '',
    '!',
    'abc=',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(JSON.stringify({ at: 'invalid', id })).toString('base64url'),
    Buffer.from(
      JSON.stringify({ at: date.toISOString(), id, workspace: 'foreign' }),
    ).toString('base64url'),
    Buffer.from(JSON.stringify({ at: '2026-09-01', id })).toString('base64url'),
    Buffer.from(
      JSON.stringify({ at: date.toISOString(), id: 'unknown' }),
    ).toString('base64url'),
  ])('rejects malformed cursor %s', (value) => {
    expect(() => codec.decode(value)).toThrow();
  });
  it.each([
    'a',
    'invoice:' + 'A'.repeat(24) + ':issued',
    'proposal:' + 'a'.repeat(24) + ':shared',
    'payment:' + 'a'.repeat(24) + ':received',
  ])('rejects malformed event id %s', (id) => {
    expect(() => validateNotificationId(id)).toThrow();
  });
  it('rejects nonnumeric/nonfinite application revisions', () => {
    expect(() => validateNotificationVersion(NaN)).toThrow();
    expect(() => validateNotificationVersion(Infinity)).toThrow();
  });
});
