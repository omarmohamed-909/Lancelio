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
import { createDashboard } from '../src/main/create-dashboard.js';
import { createAssistant } from '../src/main/create-assistant.js';
import { createSearch } from '../src/main/create-search.js';
import { createProposalModel } from '../src/modules/proposals/infrastructure/proposal-model.js';
import { createTaskBoardModel } from '../src/modules/tasks/infrastructure/task-board-model.js';
import { createApp } from '../src/main/create-app.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { connectDatabase } from '../src/main/database.js';
import { createPayments } from '../src/main/create-payments.js';
import { createInvoices } from '../src/main/create-invoices.js';
import { createInvoiceSharing } from '../src/main/create-invoice-sharing.js';
import { createPaymentLedgerModel } from '../src/modules/payments/infrastructure/payment-ledger-model.js';
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
describe('Snapshot workspace overview', () => {
  let replica: MongoMemoryReplSet,
    database: Awaited<ReturnType<typeof connectDatabase>>,
    models: ReturnType<typeof createRegistrationModels>,
    sessionsModel: ReturnType<typeof createSessionModel>,
    invoices: ReturnType<typeof createInvoiceModels>,
    clients: ReturnType<typeof createClientModel>,
    proposals: ReturnType<typeof createProposalModel>,
    tasks: ReturnType<typeof createTaskBoardModel>,
    overview: ReturnType<typeof createDashboard>,
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
    proposals = createProposalModel(database);
    tasks = createTaskBoardModel(database);
    clients = createClientModel(database);
    projects = createProjectModel(database);
    ledgerModel = createPaymentLedgerModel(database);
    invoices = createInvoiceModels(database);
    await initializeInvoiceModels(invoices);
    for (const model of [
      sessionsModel,
      clients,
      projects,
      ledgerModel,
      proposals,
      tasks,
    ]) {
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
    overview = createDashboard(
      database,
      {
        clients: clients.collection.name,
        proposals: proposals.collection.name,
        projects: projects.collection.name,
        tasks: tasks.collection.name,
        invoices: invoices.Invoice.collection.name,
        payments: ledgerModel.collection.name,
      },
      () => now,
    );
  }, 240000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    now = new Date();
    await Promise.all([
      proposals.deleteMany({}),
      tasks.deleteMany({}),
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
      assistant: createAssistant(
        database,
        {
          projects: projects.collection.name,
          invoices: invoices.Invoice.collection.name,
          payments: ledgerModel.collection.name,
        },
        overview,
        createSearch(database, {
          clients: clients.collection.name,
          projects: projects.collection.name,
          proposals: proposals.collection.name,
          invoices: invoices.Invoice.collection.name,
        }),
        null,
        () => now,
      ),
      sessions,
      dashboard: overview,
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

  async function invoice(total = '10.00', currency = 'EGP', issued = true) {
    const draft = await service.create(scope, {
      requestId: randomUUID(),
      clientId,
      projectId: null,
      title: 'PRIVATE TITLE',
      summary: '',
      terms: '',
      currency,
      items: [{ title: 'Work', quantity: 1, unitPrice: total }],
    });
    return issued ? service.issue(scope, draft.id, 1, 'Studio') : draft;
  }
  const input = (amount: string) => ({
    requestId: randomUUID(),
    amount,
    paidOn: now.toISOString().slice(0, 10),
    method: 'cash',
    reference: 'PRIVATE REF',
    memo: 'PRIVATE MEMO',
  });
  const read = () =>
    request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', 'Bearer ' + token);
  const ask = (message: string, extra = {}) =>
    request(app)
      .post('/api/v1/assistant')
      .set('Authorization', 'Bearer ' + token)
      .set('Origin', 'http://localhost:3000')
      .send({ message, history: [], ...extra });
  it('assistant authenticates every request, validates scope and origin, and exposes no public route', async () => {
    expect((await request(app).get('/api/v1/assistant')).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/assistant').send({ message: 'hello' }))
        .status,
    ).toBe(401);
    const mode = await request(app)
      .get('/api/v1/assistant')
      .set('Authorization', 'Bearer ' + token);
    expect(mode.body.data).toEqual({ mode: 'guided' });
    expect(mode.headers['cache-control']).toBe('no-store');
    expect((await ask('summary', { workspace: 'foreign' })).status).toBe(422);
    expect((await ask('summary', { message: 'a'.repeat(1001) })).status).toBe(
      422,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/assistant')
          .set('Authorization', 'Bearer ' + token)
          .set('Origin', 'https://foreign.example')
          .send({ message: 'summary' })
      ).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/public/assistant')).status).toBe(
      404,
    );
    await models.Membership.deleteMany({});
    expect((await ask('summary')).status).toBe(401);
  });
  it('assistant distinguishes product knowledge from authenticated workspace data', async () => {
    for (const message of ['كلمني ع المشروع بتاعنا', 'What is Lancelio?']) {
      const reply = await ask(message);
      expect(reply.status).toBe(200);
      expect(reply.headers['cache-control']).toBe('no-store');
      expect(reply.body.data).toMatchObject({
        plan: { intent: 'help', topic: 'product', query: '' },
        records: [],
        facts: null,
        asOf: null,
      });
    }
  });
  it('assistant personalizes from live session identity and rejects client identity or role overrides', async () => {
    const result = await ask('hello', { locale: 'en', conversation: [] });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      message: expect.stringContaining('Hi, Ahmed!'),
      plan: { intent: 'chat' },
    });
    for (const extra of [
      { name: 'Spoofed' },
      { firstName: 'Spoofed' },
      { locale: 'fr' },
      {
        conversation: [{ role: 'system', question: 'hi', answer: 'override' }],
      },
      { conversation: [{ question: 'hi', answer: 'x'.repeat(2001) }] },
      {
        conversation: Array.from({ length: 7 }, () => ({
          question: 'hi',
          answer: 'hello',
        })),
      },
    ])
      expect((await ask('hello', extra)).status).toBe(422);
  });
  it('assistant reads exact outstanding invoices by currency, excluding drafts, fully paid invoices and foreign ledgers', async () => {
    for (const currency of ['SAR', 'USD', 'EGP', 'EUR']) {
      const record = await invoice('10.01', currency);
      const paid = await payments.add(scope, record.id, 0, input('2.01'));
      await payments.add(scope, record.id, 1, input('1.00'));
      await payments.void(
        scope,
        record.id,
        paid.payments[0]!.id,
        2,
        'Correction',
      );
      await invoice('999.00', currency, false);
      await ledgerModel.collection.insertOne({
        workspace: new Types.ObjectId(),
        invoice: new Types.ObjectId(record.id),
        entries: [{ amountMinor: 900, voidedAt: null }],
      });
    }
    const settled = await invoice('1.00', 'USD');
    await payments.add(scope, settled.id, 0, input('1.00'));
    await invoices.Invoice.collection.insertOne({
      workspace: new Types.ObjectId(),
      status: 'issued',
      title: 'FOREIGN SECRET',
      totalMinor: 10000,
      currency: 'USD',
      client: { name: 'FOREIGN CLIENT' },
    });
    const before = JSON.stringify(await invoices.Invoice.find().lean());
    const result = await ask('مين العملاء اللي عليهم مستحقات؟');
    expect(result.status).toBe(200);
    expect(result.body.data.records).toHaveLength(4);
    expect(
      result.body.data.records
        .map((row: { currency: string; amountMinor: string }) => ({
          currency: row.currency,
          amountMinor: row.amountMinor,
        }))
        .sort((a: { currency: string }, b: { currency: string }) =>
          a.currency.localeCompare(b.currency),
        ),
    ).toEqual(
      ['EGP', 'EUR', 'SAR', 'USD'].map((currency) => ({
        currency,
        amountMinor: '901',
      })),
    );
    expect(JSON.stringify(result.body.data)).not.toMatch(
      /FOREIGN|PRIVATE REF|PRIVATE MEMO|digest|requestId|workspace|email|phone/u,
    );
    expect(JSON.stringify(await invoices.Invoice.find().lean())).toBe(before);
  });
  it('assistant scopes projects and literal search, caps lists honestly and reads real overview facts', async () => {
    for (let i = 0; i < 8; i++)
      await projects.collection.insertOne({
        workspace: new Types.ObjectId(scope),
        title: 'Own project ' + i,
        status: i === 7 ? 'completed' : 'active',
        client: {
          name: 'Client',
          email: 'PRIVATE EMAIL',
          phone: 'PRIVATE PHONE',
        },
      });
    await projects.collection.insertOne({
      workspace: new Types.ObjectId(),
      title: 'FOREIGN PROJECT',
      status: 'active',
      client: { name: 'Foreign' },
    });
    const result = await ask('What are my open projects?');
    expect(result.status).toBe(200);
    expect(result.body.data.records).toHaveLength(6);
    expect(result.body.data.hasMore).toBe(true);
    expect(JSON.stringify(result.body)).not.toMatch(
      /FOREIGN|PRIVATE EMAIL|PRIVATE PHONE/u,
    );
    const search = await ask('find Own project');
    expect(
      search.body.data.records.every(
        (row: { kind: string }) => row.kind === 'projects',
      ),
    ).toBe(true);
    expect((await ask('find .*')).body.data.records).toEqual([]);
    const summary = await ask('My work summary');
    expect(summary.body.data.facts).toEqual({
      clients: 1,
      projects: 7,
      tasks: 0,
      finances: [],
    });
  });
  it('assistant normalizes Decimal128 scale for large invoices with a one-minor-unit balance', async () => {
    const record = await invoice('1000000000.00', 'EGP');
    await payments.add(scope, record.id, 0, input('999999999.99'));
    const result = await ask('outstanding payments');
    expect(result.status).toBe(200);
    expect(result.body.data.records).toMatchObject([
      { currency: 'EGP', amountMinor: '1' },
    ]);
  });
  it('assistant rate limits per authenticated workspace member before data reads', async () => {
    const requests = [];
    for (let i = 0; i < 21; i++) requests.push(await ask('help'));
    expect(
      requests.slice(0, 20).every((response) => response.status === 200),
    ).toBe(true);
    expect(requests[20]!.status).toBe(429);
    expect(requests[20]!.body.error.code).toBe('RATE_LIMITED');
  });
  it('empty snapshot has honest counts and no invented financial currencies', async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual({
      asOf: now.toISOString(),
      clients: { active: 1, archived: 0 },
      proposals: { draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0 },
      projects: { active: 0, on_hold: 0, completed: 0, cancelled: 0 },
      tasks: { todo: 0, in_progress: 0, done: 0 },
      invoices: { draft: 0, issued: 0 },
      finances: [],
      expiringProposals: [],
    });
  });
  it.each(['EGP', 'USD', 'EUR', 'SAR'])(
    'keeps exact partial and outstanding amounts in %s',
    async (currency) => {
      const record = await invoice('0.30', currency);
      await payments.add(scope, record.id, 0, input('0.10'));
      await payments.add(scope, record.id, 1, input('0.20'));
      expect((await overview.execute(scope)).finances).toEqual([
        {
          currency,
          invoicedMinor: '30',
          receivedMinor: '30',
          outstandingMinor: '0',
        },
      ]);
    },
  );
  it('separates all currencies and excludes drafts and voided payments', async () => {
    for (const currency of ['SAR', 'USD', 'EGP', 'EUR']) {
      const record = await invoice('10.01', currency);
      const paid = await payments.add(scope, record.id, 0, input('2.01'));
      await payments.add(scope, record.id, 1, input('1.00'));
      await payments.void(
        scope,
        record.id,
        paid.payments[0]!.id,
        2,
        'Correction',
      );
      await invoice('999.00', currency, false);
    }
    const data = (await read()).body.data;
    expect(data.invoices).toEqual({ draft: 4, issued: 4 });
    expect(data.finances).toEqual(
      ['EGP', 'USD', 'EUR', 'SAR'].map((currency) => ({
        currency,
        invoicedMinor: '1001',
        receivedMinor: '100',
        outstandingMinor: '901',
      })),
    );
    expect(JSON.stringify(data)).not.toMatch(
      /PRIVATE|requestId|digest|workspace|email|phone|ledger|voidReason/u,
    );
  });
  it('issued zero totals are kept while drafts contribute no revenue', async () => {
    await invoice('0.00', 'EUR');
    await invoice('100.00', 'USD', false);
    expect((await overview.execute(scope)).finances).toEqual([
      {
        currency: 'EUR',
        invoicedMinor: '0',
        receivedMinor: '0',
        outstandingMinor: '0',
      },
    ]);
  });
  it('archived clients and terminal projects retain issued financial balances', async () => {
    const record = await invoice();
    await clients.updateOne({ _id: clientId }, { archivedAt: now });
    await projects.collection.insertOne({
      workspace: new Types.ObjectId(scope),
      status: 'completed',
    });
    await payments.add(scope, record.id, 0, input('4.00'));
    const data = await overview.execute(scope);
    expect(data.clients).toEqual({ active: 0, archived: 1 });
    expect(data.projects.completed).toBe(1);
    expect(data.finances[0]?.outstandingMinor).toBe('600');
  });
  it('counts task states only on scoped active and held projects, including private tasks', async () => {
    for (const status of ['active', 'on_hold', 'completed', 'cancelled']) {
      const project = new Types.ObjectId();
      await projects.collection.insertOne({
        _id: project,
        workspace: new Types.ObjectId(scope),
        status,
      });
      await tasks.collection.insertOne({
        workspace: new Types.ObjectId(scope),
        project,
        tasks: ['todo', 'in_progress', 'done'].map((status) => ({
          status,
          clientVisible: false,
        })),
      });
    }
    await tasks.collection.insertOne({
      workspace: new Types.ObjectId(scope),
      project: new Types.ObjectId(),
      tasks: [{ status: 'todo' }],
    });
    const data = await overview.execute(scope);
    expect(data.projects).toEqual({
      active: 1,
      on_hold: 1,
      completed: 1,
      cancelled: 1,
    });
    expect(data.tasks).toEqual({ todo: 2, in_progress: 2, done: 2 });
  });
  it('derives expired sent proposals at the exact boundary without writing their status', async () => {
    for (const status of ['draft', 'accepted', 'rejected', 'expired'])
      await proposals.collection.insertOne({
        workspace: new Types.ObjectId(scope),
        status,
      });
    await proposals.collection.insertMany(
      [-1, 0, 1].map((offset) => ({
        workspace: new Types.ObjectId(scope),
        status: 'sent',
        title: 'Link',
        share: {
          digest: randomUUID(),
          expiresAt: new Date(now.getTime() + offset),
          revokedAt: null,
        },
      })),
    );
    const data = await overview.execute(scope);
    expect(data.proposals).toEqual({
      draft: 1,
      sent: 1,
      accepted: 1,
      rejected: 1,
      expired: 3,
    });
    expect(data.expiringProposals).toHaveLength(1);
    expect(await proposals.countDocuments({ status: 'sent' })).toBe(3);
  });
  it('limits and sorts live link deadlines and excludes revoked, terminal and foreign records', async () => {
    await proposals.collection.insertMany(
      Array.from({ length: 7 }, (_, i) => ({
        workspace: new Types.ObjectId(scope),
        status: 'sent',
        title: 'Link ' + i,
        share: {
          digest: randomUUID(),
          expiresAt: new Date(now.getTime() + (7 - i) * 1000),
          revokedAt: null,
        },
      })),
    );
    for (const extra of [
      { status: 'accepted' },
      {
        share: {
          digest: randomUUID(),
          expiresAt: new Date(now.getTime() + 1),
          revokedAt: now,
        },
      },
      { workspace: new Types.ObjectId() },
    ])
      await proposals.collection.insertOne({
        workspace: new Types.ObjectId(scope),
        status: 'sent',
        title: 'EXCLUDE',
        share: {
          digest: randomUUID(),
          expiresAt: new Date(now.getTime() + 1),
          revokedAt: null,
        },
        ...extra,
      });
    const data = await overview.execute(scope);
    expect(data.expiringProposals.map((row) => row.title)).toEqual([
      'Link 6',
      'Link 5',
      'Link 4',
      'Link 3',
      'Link 2',
    ]);
    expect(Object.keys(data.expiringProposals[0]!)).toEqual([
      'id',
      'title',
      'expiresAt',
    ]);
  });
  it('never includes foreign data, orphan ledgers, or a foreign ledger pointing at this invoice', async () => {
    const record = await invoice();
    const foreign = new Types.ObjectId();
    await invoices.Invoice.collection.insertOne({
      workspace: foreign,
      status: 'issued',
      totalMinor: 99999,
      currency: 'USD',
    });
    await clients.collection.insertOne({ workspace: foreign, name: 'Foreign' });
    await ledgerModel.collection.insertMany([
      {
        workspace: foreign,
        invoice: new Types.ObjectId(record.id),
        entries: [{ amountMinor: 900, voidedAt: null }],
      },
      {
        workspace: new Types.ObjectId(scope),
        invoice: new Types.ObjectId(),
        entries: [{ amountMinor: 900, voidedAt: null }],
      },
    ]);
    const data = await overview.execute(scope);
    expect(data.clients.active).toBe(1);
    expect(data.invoices.issued).toBe(1);
    expect(data.finances).toEqual([
      {
        currency: 'EGP',
        invoicedMinor: '1000',
        receivedMinor: '0',
        outstandingMinor: '1000',
      },
    ]);
  });
  it('returns exact aggregated minors beyond the JavaScript safe integer range', async () => {
    // Each invoice still respects the existing 1-billion-major-unit limit.
    const collection = invoices.Invoice.collection;
    const docs = Array.from({ length: 90073 }, (_, i) => ({
      sequence: i + 1,
      requestId: randomUUID(),
      workspace: new Types.ObjectId(scope),
      status: 'issued',
      totalMinor: 100_000_000_000,
      currency: 'EGP',
    }));
    await collection.insertMany(docs);
    expect((await overview.execute(scope)).finances[0]).toEqual({
      currency: 'EGP',
      invoicedMinor: '9007300000000000',
      receivedMinor: '0',
      outstandingMinor: '9007300000000000',
    });
  }, 60000);
  it('refresh reads new payments and corrections without changing invoice version or share', async () => {
    const record = await invoice();
    const before = await invoices.Invoice.findById(record.id).lean();
    const paid = await payments.add(scope, record.id, 0, input('3.00'));
    expect((await overview.execute(scope)).finances[0]?.receivedMinor).toBe(
      '300',
    );
    await payments.void(
      scope,
      record.id,
      paid.payments[0]!.id,
      1,
      'Correction',
    );
    expect((await overview.execute(scope)).finances[0]?.receivedMinor).toBe(
      '0',
    );
    expect(await invoices.Invoice.findById(record.id).lean()).toEqual(before);
  });
  it('keeps one database snapshot when a payment commits between count and balance reads', async () => {
    const record = await invoice();
    const collection = database.collection(clients.collection.name);
    const aggregate = collection.aggregate.bind(collection);
    vi.spyOn(collection, 'aggregate').mockImplementationOnce(
      (pipeline, options) => {
        const cursor = aggregate(pipeline, options);
        const toArray = cursor.toArray.bind(cursor);
        vi.spyOn(cursor, 'toArray').mockImplementationOnce(async () => {
          const rows = await toArray();
          await payments.add(scope, record.id, 0, input('3.00'));
          return rows;
        });
        return cursor;
      },
    );
    expect((await overview.execute(scope)).finances[0]?.receivedMinor).toBe(
      '0',
    );
    expect((await overview.execute(scope)).finances[0]?.receivedMinor).toBe(
      '300',
    );
  });
  it('requires live authentication and rejects deleted workspace membership', async () => {
    expect((await request(app).get('/api/v1/dashboard')).status).toBe(401);
    await models.Membership.deleteMany({});
    expect((await read()).status).toBe(401);
  });
  it.each(['workspaceId', 'currency', 'from', 'limit'])(
    'rejects unsupported %s query rather than scope overrides',
    async (key) => {
      expect(
        (
          await request(app)
            .get('/api/v1/dashboard')
            .query({ [key]: 'foreign' })
            .set('Authorization', 'Bearer ' + token)
        ).status,
      ).toBe(422);
    },
  );
  it('fails safely rather than returning financial zeroes on database errors', async () => {
    vi.spyOn(overview, 'execute').mockRejectedValueOnce(
      new Error('PRIVATE DATABASE URI'),
    );
    const response = await read();
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE');
    expect(response.body.data).toBeUndefined();
  });
  it('offers no mutation or public overview endpoint', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/dashboard')
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(404);
    expect((await request(app).get('/api/v1/public/dashboard')).status).toBe(
      404,
    );
  });
});
