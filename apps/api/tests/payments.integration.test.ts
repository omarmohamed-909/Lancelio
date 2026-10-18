import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { Types } from 'mongoose';
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
import { connectDatabase } from '../src/main/database.js';
import { createPayments } from '../src/main/create-payments.js';
import { createInvoices } from '../src/main/create-invoices.js';
import { createInvoiceSharing } from '../src/main/create-invoice-sharing.js';
import { createPaymentLedgerModel } from '../src/modules/payments/infrastructure/payment-ledger-model.js';
import { MongoPaymentStore } from '../src/modules/payments/infrastructure/mongo-payment-store.js';
import {
  createInvoiceModels,
  initializeInvoiceModels,
} from '../src/modules/invoices/infrastructure/invoice-model.js';
import { createClientModel } from '../src/modules/clients/infrastructure/client-model.js';
import { createProjectModel } from '../src/modules/projects/infrastructure/project-model.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
const account = {
  name: 'Ahmed',
  email: 'payments@example.com',
  password: 'secure payment test passphrase',
};
describe('Private atomic invoice payment ledgers', () => {
  let replica: MongoMemoryReplSet,
    database: Awaited<ReturnType<typeof connectDatabase>>,
    models: ReturnType<typeof createRegistrationModels>,
    sessionsModel: ReturnType<typeof createSessionModel>,
    invoices: ReturnType<typeof createInvoiceModels>,
    clients: ReturnType<typeof createClientModel>,
    projects: ReturnType<typeof createProjectModel>,
    ledgerModel: ReturnType<typeof createPaymentLedgerModel>,
    register: RegisterAccount,
    sessions: Awaited<ReturnType<typeof createAuthentication>>,
    service: ReturnType<typeof createInvoices>,
    payments: ReturnType<typeof createPayments>,
    sharing: ReturnType<typeof createInvoiceSharing>,
    app: ReturnType<typeof createApp>,
    token: string,
    scope: string,
    clientId: string,
    now: Date;
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
    database = await connectDatabase(replica.getUri('payment-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionsModel = createSessionModel(database);
    clients = createClientModel(database);
    projects = createProjectModel(database);
    ledgerModel = createPaymentLedgerModel(database);
    invoices = createInvoiceModels(database);
    await initializeInvoiceModels(invoices);
    for (const model of [sessionsModel, clients, projects, ledgerModel]) {
      await model.createCollection();
      await model.createIndexes();
    }
    sessions = await createAuthentication(
      models,
      sessionsModel,
      'payment-test-secret-at-least-32-characters',
      false,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    service = createInvoices(database, invoices, clients, projects, () => now);
    payments = createPayments(ledgerModel, invoices.Invoice, () => now);
    sharing = createInvoiceSharing(invoices, () => now);
  }, 240000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    now = new Date();
    await Promise.all([
      ledgerModel.deleteMany({}),
      invoices.Invoice.deleteMany({}),
      invoices.Counter.deleteMany({}),
      clients.deleteMany({}),
      projects.deleteMany({}),
      sessionsModel.deleteMany({}),
      models.Membership.deleteMany({}),
      models.Workspace.deleteMany({}),
      models.User.deleteMany({}),
    ]);
    await register.execute(account);
    const login = await sessions.login.execute(account);
    token = login.accessToken;
    scope = login.identity.workspace.id;
    clientId = (
      await clients.create({ workspace: scope, name: 'Client' })
    )._id.toString();
    app = createApp('http://localhost:3000', {
      sessions,
      invoices: service,
      invoiceSharing: sharing,
      payments,
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replica?.stop();
  });
  const body = (overrides: Record<string, unknown> = {}) => ({
    version: 0,
    requestId: randomUUID(),
    amount: '1.25',
    paidOn: now.toISOString().slice(0, 10),
    method: 'bank_transfer',
    reference: ' bank ',
    memo: ' PRIVATE PAYMENT MEMO ',
    ...overrides,
  });
  async function invoice(issued = true, total = '10.00', currency = 'EGP') {
    const draft = await service.create(scope, {
      requestId: randomUUID(),
      clientId,
      projectId: null,
      title: 'Invoice payment test',
      summary: '',
      terms: '',
      currency,
      items: [{ title: 'Work', quantity: 1, unitPrice: total }],
    });
    return issued ? service.issue(scope, draft.id, 1, 'Studio') : draft;
  }
  const route = (id: string) => '/api/v1/invoices/' + id + '/payments';
  const add = (id: string, data: ReturnType<typeof body>) =>
    request(app)
      .post(route(id))
      .set('Authorization', 'Bearer ' + token)
      .send(data);
  const read = (id: string) =>
    request(app)
      .get(route(id))
      .set('Authorization', 'Bearer ' + token);
  const cancel = (
    id: string,
    paymentId: string,
    version: number,
    reason = 'wrong entry',
  ) =>
    request(app)
      .post(route(id) + '/' + paymentId + '/void')
      .set('Authorization', 'Bearer ' + token)
      .send({ version, reason });
  it('reads without creating a ledger and requires issuance for writes', async () => {
    const draft = await invoice(false);
    const response = await read(draft.id);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      version: 0,
      paymentStatus: 'not_issued',
      paidMinor: 0,
      remainingMinor: 1000,
      payments: [],
    });
    expect(await ledgerModel.countDocuments()).toBe(0);
    expect((await add(draft.id, body())).status).toBe(409);
    expect(await ledgerModel.countDocuments()).toBe(0);
  });
  it('records exact partial and full payments in invoice currency and keeps invoice immutable', async () => {
    const saved = await invoice(true, '3.75', 'USD'),
      before = await invoices.Invoice.findById(saved.id).lean();
    const first = await add(saved.id, body());
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      currency: 'USD',
      paidMinor: 125,
      remainingMinor: 250,
      paymentStatus: 'partially_paid',
      version: 1,
    });
    expect(Object.keys(first.body.data.payments[0]).sort()).toEqual(
      [
        'id',
        'amountMinor',
        'paidOn',
        'method',
        'reference',
        'memo',
        'createdAt',
        'voidedAt',
        'voidReason',
      ].sort(),
    );
    const second = await add(
      saved.id,
      body({ version: 1, amount: '2.50', method: 'cash' }),
    );
    expect(second.body.data).toMatchObject({
      paidMinor: 375,
      remainingMinor: 0,
      paymentStatus: 'paid',
      version: 2,
    });
    expect(await invoices.Invoice.findById(saved.id).lean()).toEqual(before);
    expect((await invoices.Counter.findById(scope).orFail()).sequence).toBe(1);
  });
  it.each(['EGP', 'USD', 'EUR', 'SAR'])(
    'allows exact minor payments in %s',
    async (currency) => {
      const saved = await invoice(true, '0.01', currency);
      expect(
        (await add(saved.id, body({ amount: '0.01' }))).body.data,
      ).toMatchObject({
        currency,
        paidMinor: 1,
        remainingMinor: 0,
        paymentStatus: 'paid',
      });
    },
  );
  it('returns one payment for a normalized creation replay even with stale revision', async () => {
    const saved = await invoice(),
      input = body(),
      first = await add(saved.id, input);
    const replay = await add(saved.id, {
      ...input,
      amount: '01.25',
      reference: 'bank',
      memo: 'PRIVATE PAYMENT MEMO',
    });
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(
      (await ledgerModel.findOne({ invoice: saved.id }).orFail()).entries,
    ).toHaveLength(1);
    expect(JSON.stringify(first.body.data)).not.toContain(input.requestId);
    expect((await add(saved.id, { ...input, amount: '2' })).status).toBe(409);
  });
  it('same payment key races create one entry and return the same result', async () => {
    const saved = await invoice(),
      input = body();
    const replies = await Promise.all([
      add(saved.id, input),
      add(saved.id, input),
    ]);
    expect(replies.map((r) => r.status)).toEqual([201, 201]);
    expect(replies[0]!.body.data).toEqual(replies[1]!.body.data);
    expect(await ledgerModel.countDocuments()).toBe(1);
    expect(
      (await ledgerModel.findOne({ invoice: saved.id }).orFail()).entries,
    ).toHaveLength(1);
  });
  it('competing first payments cannot overpay', async () => {
    const saved = await invoice(true, '10.00');
    const replies = await Promise.all([
      add(saved.id, body({ amount: '8' })),
      add(saved.id, body({ amount: '8' })),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await read(saved.id)).body.data).toMatchObject({
      paidMinor: 800,
      remainingMinor: 200,
      version: 1,
    });
  });
  it('competing later payments match one common revision', async () => {
    const saved = await invoice();
    await add(saved.id, body({ amount: '1' }));
    const replies = await Promise.all([
      add(saved.id, body({ version: 1, amount: '8' })),
      add(saved.id, body({ version: 1, amount: '8' })),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await read(saved.id)).body.data.paidMinor).toBe(900);
  });
  it('rejects overpayments without changing version or entries', async () => {
    const saved = await invoice();
    await add(saved.id, body({ amount: '9' }));
    const before = await ledgerModel.findOne({ invoice: saved.id }).lean();
    const result = await add(saved.id, body({ version: 1, amount: '1.01' }));
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('PAYMENT_OVERPAYMENT');
    expect(await ledgerModel.findOne({ invoice: saved.id }).lean()).toEqual(
      before,
    );
  });
  it('voids an entry with history, restores balance and does not duplicate a voided creation replay', async () => {
    const saved = await invoice(),
      input = body({ amount: '10' });
    const first = await add(saved.id, input),
      id = first.body.data.payments[0].id;
    now = new Date(now.getTime() + 1000);
    const response = await cancel(saved.id, id, 1, 'duplicate bank entry');
    expect(response.body.data).toMatchObject({
      paidMinor: 0,
      remainingMinor: 1000,
      paymentStatus: 'unpaid',
      version: 2,
    });
    expect(response.body.data.payments[0]).toMatchObject({
      amountMinor: 1000,
      voidReason: 'duplicate bank entry',
      voidedAt: now.toISOString(),
    });
    expect((await add(saved.id, input)).body.data).toEqual(response.body.data);
    now = new Date(now.getTime() + 1000);
    expect((await cancel(saved.id, id, 2, 'another reason')).body.data).toEqual(
      response.body.data,
    );
    expect((await cancel(saved.id, id, 1)).status).toBe(409);
    expect(
      (await add(saved.id, body({ version: 2, amount: '10' }))).body.data,
    ).toMatchObject({ paidMinor: 1000, paymentStatus: 'paid', version: 3 });
  });
  it('serializes correction versus adding another payment', async () => {
    const saved = await invoice(),
      first = await add(saved.id, body({ amount: '5' })),
      id = first.body.data.payments[0].id;
    const replies = await Promise.all([
      cancel(saved.id, id, 1),
      add(saved.id, body({ version: 1, amount: '4' })),
    ]);
    expect(replies.filter((reply) => reply.status === 409)).toHaveLength(1);
    expect([200, 201]).toContain(
      replies.find((reply) => reply.status !== 409)?.status,
    );
    const current = (await read(saved.id)).body.data;
    expect(current.version).toBe(2);
    expect([0, 900]).toContain(current.paidMinor);
  });
  it('failed storage exposes no partial change or leaked error details', async () => {
    const saved = await invoice(),
      before = await invoices.Invoice.findById(saved.id).lean();
    vi.spyOn(MongoPaymentStore.prototype, 'save').mockRejectedValueOnce(
      new Error('PRIVATE STORAGE DETAIL'),
    );
    const result = await add(saved.id, body());
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('PRIVATE STORAGE DETAIL');
    expect(await ledgerModel.countDocuments()).toBe(0);
    expect(await invoices.Invoice.findById(saved.id).lean()).toEqual(before);
  });
  it('failed correction retains its active entry and balance', async () => {
    const saved = await invoice(),
      first = await add(saved.id, body()),
      before = await read(saved.id);
    vi.spyOn(MongoPaymentStore.prototype, 'save').mockRejectedValueOnce(
      new Error('write failed'),
    );
    expect(
      (await cancel(saved.id, first.body.data.payments[0].id, 1)).status,
    ).toBe(500);
    expect((await read(saved.id)).body.data).toEqual(before.body.data);
  });
  it('protects both invoices and payment identities across workspaces', async () => {
    const saved = await invoice(),
      first = await add(saved.id, body());
    await register.execute({ ...account, email: 'other-payments@example.com' });
    token = (
      await sessions.login.execute({
        ...account,
        email: 'other-payments@example.com',
      })
    ).accessToken;
    expect((await read(saved.id)).status).toBe(404);
    expect((await add(saved.id, body())).status).toBe(404);
    expect(
      (await cancel(saved.id, first.body.data.payments[0].id, 1)).status,
    ).toBe(404);
    expect(
      (await ledgerModel.findOne({ invoice: saved.id }).orFail()).version,
    ).toBe(1);
  });
  it('rejects a payment id from another invoice', async () => {
    const a = await invoice(),
      b = await invoice(),
      entry = (await add(a.id, body())).body.data.payments[0];
    expect((await cancel(b.id, entry.id, 0)).status).toBe(404);
    expect((await read(a.id)).body.data.paidMinor).toBe(125);
  });
  it('requires live membership and does not authorize public grants for ledger access', async () => {
    const saved = await invoice(),
      grant = await sharing.issue(scope, saved.id, 2, 7);
    expect((await request(app).get(route(saved.id))).status).toBe(401);
    expect(
      (
        await request(app)
          .get(route(saved.id))
          .set('Authorization', 'Bearer ' + grant.token)
      ).status,
    ).toBe(401);
    await models.Membership.deleteMany({ workspace: scope });
    expect((await read(saved.id)).status).toBe(401);
  });
  it('leaves existing public documents and grants unchanged after add/void', async () => {
    const saved = await invoice(),
      grant = await sharing.issue(scope, saved.id, 2, 7);
    const before = await sharing.readPublic(grant.token),
      privateBefore = await invoices.Invoice.findById(saved.id).lean();
    const added = await add(saved.id, body());
    expect(await sharing.readPublic(grant.token)).toEqual(before);
    expect(JSON.stringify(before)).not.toMatch(
      /paidMinor|remainingMinor|paymentStatus|PRIVATE PAYMENT MEMO|requestId/u,
    );
    await cancel(saved.id, added.body.data.payments[0].id, 1);
    expect(await sharing.readPublic(grant.token)).toEqual(before);
    expect(await invoices.Invoice.findById(saved.id).lean()).toEqual(
      privateBefore,
    );
  });
  it('handles zero-value issued invoices without artificial payments', async () => {
    const saved = await invoice(true, '0.00');
    expect((await read(saved.id)).body.data).toMatchObject({
      paidMinor: 0,
      remainingMinor: 0,
      paymentStatus: 'paid',
      version: 0,
      payments: [],
    });
    expect((await add(saved.id, body({ amount: '0.01' }))).status).toBe(422);
  });
  it('retains a finite auditable ledger including cancelled entries', async () => {
    const saved = await invoice();
    await ledgerModel.create({
      workspace: scope,
      invoice: saved.id,
      version: 1,
      entries: Array.from({ length: 200 }, () => ({
        _id: new Types.ObjectId(),
        requestId: randomUUID(),
        amountMinor: 1,
        paidOn: now.toISOString().slice(0, 10),
        method: 'cash',
        reference: '',
        memo: '',
        createdAt: now,
        voidedAt: now,
        voidReason: 'wrong',
      })),
    });
    const result = await add(saved.id, body({ version: 1 }));
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('PAYMENT_LIMIT_REACHED');
    expect((await read(saved.id)).body.data.payments).toHaveLength(200);
  });
  it.each([
    { amount: '0' },
    { amount: '-1' },
    { amount: '1.005' },
    { amount: 1 },
    { paidOn: '2026-02-29' },
    { paidOn: '9999-01-01' },
    { method: 'card' },
    { requestId: 'bad' },
    { reference: 'a'.repeat(101) },
    { memo: 'a'.repeat(501) },
    { version: -1 },
    { version: 0.1 },
  ])('rejects invalid payment %j', async (invalid) => {
    const saved = await invoice();
    expect((await add(saved.id, body(invalid))).status).toBe(422);
    expect(await ledgerModel.countDocuments()).toBe(0);
  });
  it('rejects mass assignment, query parameters, edits/deletion and public ledger paths', async () => {
    const saved = await invoice();
    for (const field of [
      'workspace',
      'currency',
      'amountMinor',
      'paidMinor',
      'invoiceStatus',
      'voidedAt',
    ])
      expect((await add(saved.id, body({ [field]: 'injected' }))).status).toBe(
        422,
      );
    expect(
      (
        await request(app)
          .get(route(saved.id) + '?cursor=x')
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .post(route(saved.id) + '?x=1')
          .set('Authorization', 'Bearer ' + token)
          .send(body())
      ).status,
    ).toBe(422);
    const entry = (await add(saved.id, body())).body.data.payments[0];
    expect((await cancel(saved.id, entry.id, 1, '')).status).toBe(422);
    expect(
      (
        await request(app)
          .delete(route(saved.id) + '/' + entry.id)
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .put(route(saved.id) + '/' + entry.id)
          .set('Authorization', 'Bearer ' + token)
          .send(body())
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app).get(
          '/api/v1/public/invoices/' + saved.id + '/payments',
        )
      ).status,
    ).toBe(404);
  });
});
