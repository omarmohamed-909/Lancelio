import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Types } from 'mongoose';
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
import { connectDatabase } from '../src/main/database.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { createPortal } from '../src/main/create-portal.js';
import { createInvoices } from '../src/main/create-invoices.js';
import { createPayments } from '../src/main/create-payments.js';
import { createProjects } from '../src/main/create-projects.js';
import { createTasks } from '../src/main/create-tasks.js';
import { createPortalModel } from '../src/modules/portal/infrastructure/portal-model.js';
import { CryptoPortalSecrets } from '../src/modules/portal/infrastructure/portal-secrets.js';
import { createClientModel } from '../src/modules/clients/infrastructure/client-model.js';
import { createProjectModel } from '../src/modules/projects/infrastructure/project-model.js';
import { createTaskBoardModel } from '../src/modules/tasks/infrastructure/task-board-model.js';
import { createPaymentLedgerModel } from '../src/modules/payments/infrastructure/payment-ledger-model.js';
import {
  createInvoiceModels,
  initializeInvoiceModels,
} from '../src/modules/invoices/infrastructure/invoice-model.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
const account = {
  name: 'Portal Owner',
  email: 'portal@example.com',
  password: 'a long secure portal test password',
  workspaceName: 'Portal Studio',
};
describe('Client-scoped live portal grants', () => {
  let replica: MongoMemoryReplSet,
    database: Awaited<ReturnType<typeof connectDatabase>>,
    models: ReturnType<typeof createRegistrationModels>,
    sessionsModel: ReturnType<typeof createSessionModel>,
    sessions: Awaited<ReturnType<typeof createAuthentication>>,
    register: RegisterAccount,
    clients: ReturnType<typeof createClientModel>,
    projects: ReturnType<typeof createProjectModel>,
    tasks: ReturnType<typeof createTaskBoardModel>,
    invoices: ReturnType<typeof createInvoiceModels>,
    payments: ReturnType<typeof createPaymentLedgerModel>,
    grants: ReturnType<typeof createPortalModel>,
    portal: ReturnType<typeof createPortal>,
    invoiceService: ReturnType<typeof createInvoices>,
    paymentService: ReturnType<typeof createPayments>,
    projectService: ReturnType<typeof createProjects>,
    taskService: ReturnType<typeof createTasks>,
    app: ReturnType<typeof createApp>,
    scope: string,
    clientId: string,
    token: string,
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
    database = await connectDatabase(replica.getUri('portal-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionsModel = createSessionModel(database);
    clients = createClientModel(database);
    projects = createProjectModel(database);
    tasks = createTaskBoardModel(database);
    payments = createPaymentLedgerModel(database);
    grants = createPortalModel(database);
    invoices = createInvoiceModels(database);
    await initializeInvoiceModels(invoices);
    for (const model of [
      sessionsModel,
      clients,
      projects,
      tasks,
      payments,
      grants,
    ]) {
      await model.createCollection();
      await model.createIndexes();
    }
    sessions = await createAuthentication(
      models,
      sessionsModel,
      'portal-test-secret-at-least-32-characters',
      false,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    portal = createPortal(
      database,
      grants,
      {
        clients: clients.collection.name,
        workspaces: models.Workspace.collection.name,
        projects: projects.collection.name,
        tasks: tasks.collection.name,
        invoices: invoices.Invoice.collection.name,
        payments: payments.collection.name,
      },
      () => now,
    );
    invoiceService = createInvoices(
      database,
      invoices,
      clients,
      projects,
      () => now,
    );
    paymentService = createPayments(payments, invoices.Invoice, () => now);
    projectService = createProjects(database, projects, clients);
    taskService = createTasks(database, tasks, projects, () => now);
  }, 240000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    now = new Date();
    await Promise.all([
      grants.deleteMany({}),
      payments.deleteMany({}),
      tasks.deleteMany({}),
      projects.deleteMany({}),
      invoices.Invoice.deleteMany({}),
      invoices.Counter.deleteMany({}),
      clients.deleteMany({}),
      sessionsModel.deleteMany({}),
      models.Membership.deleteMany({}),
      models.Workspace.deleteMany({}),
      models.User.deleteMany({}),
    ]);
    await register.execute(account);
    const login = await sessions.login.execute(account);
    scope = login.identity.workspace.id;
    token = login.accessToken;
    clientId = (
      await clients.create({
        workspace: scope,
        name: 'Portal Client',
        email: 'PRIVATE@example.com',
        phone: 'PRIVATE PHONE',
        notes: 'PRIVATE NOTES',
        company: 'Company',
      })
    ).id;
    app = createApp('http://localhost:3000', { sessions, portal });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replica?.stop();
  });
  const route = () => '/api/v1/clients/' + clientId + '/portal';
  const read = () =>
    request(app)
      .get(route())
      .set('Authorization', 'Bearer ' + token);
  const issue = (version = 0, days = 7) =>
    request(app)
      .post(route())
      .set('Authorization', 'Bearer ' + token)
      .send({ version, days });
  const revoke = (version: number) =>
    request(app)
      .post(route() + '/revoke')
      .set('Authorization', 'Bearer ' + token)
      .send({ version });
  const publicRead = (secret: string, extra: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/public/portal/read')
      .send({ token: secret, ...extra });
  async function invoice(
    total = '10.00',
    currency = 'EGP',
    issued = true,
    target = clientId,
  ) {
    const draft = await invoiceService.create(scope, {
      requestId: randomUUID(),
      clientId: target,
      projectId: null,
      title: 'Client invoice',
      summary: 'PRIVATE BILLING SUMMARY',
      terms: 'PRIVATE TERMS',
      currency,
      items: [{ title: 'Work', quantity: 1, unitPrice: total }],
    });
    return issued
      ? invoiceService.issue(scope, draft.id, 1, account.workspaceName)
      : draft;
  }
  async function project(title = 'Client project', target = clientId) {
    return projectService.create(scope, {
      clientId: target,
      title,
      summary: 'Shared project brief',
    });
  }
  const payment = (amount: string) => ({
    requestId: randomUUID(),
    amount,
    paidOn: now.toISOString().slice(0, 10),
    method: 'cash',
    memo: 'PRIVATE PAYMENT MEMO',
    reference: 'PRIVATE REF',
  });
  it('state is virtual revision zero, scoped and secret-free without writes', async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual({
      client: {
        id: clientId,
        name: 'Portal Client',
        company: 'Company',
        archived: false,
      },
      version: 0,
      share: null,
    });
    expect(await grants.countDocuments()).toBe(0);
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE');
  });
  it('first issuance captures an independent revision, stores only digest and preserves public client version/date', async () => {
    const before = await clients.findById(clientId).lean().orFail();
    const response = await issue();
    expect(response.status).toBe(201);
    expect(response.body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(response.body.data.version).toBe(1);
    expect(
      new Date(response.body.data.share.expiresAt).getTime() - now.getTime(),
    ).toBe(7 * 86400000);
    const stored = await grants.findOne().lean().orFail();
    expect(stored.digest).toBe(
      new CryptoPortalSecrets().digest(response.body.data.token),
    );
    expect(JSON.stringify(stored)).not.toContain(response.body.data.token);
    const after = await clients.findById(clientId).lean().orFail();
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.referenceRevision).toBe(before.referenceRevision + 1);
    expect(JSON.stringify((await read()).body)).not.toMatch(/token|digest/u);
  });
  it('only publishes this client projects, visible tasks and issued financial summaries', async () => {
    const owned = await project();
    let board = await taskService.create(scope, owned.id, 0, {
      title: 'PRIVATE TASK',
      description: 'PRIVATE TASK CONTENT',
      priority: 'high',
    });
    board = await taskService.create(scope, owned.id, board.version, {
      title: 'Shared task',
      description: 'Shared instructions',
      priority: 'normal',
    });
    const visible = board.tasks[1]!;
    await taskService.setClientVisibility(
      scope,
      owned.id,
      visible.id,
      board.version,
      true,
    );
    const issued = await invoice('0.30');
    await paymentService.add(scope, issued.id, 0, payment('0.10'));
    await invoice('999.00', 'USD', false);
    const other = (
      await clients.create({ workspace: scope, name: 'Other client' })
    ).id;
    await project('OTHER CLIENT PROJECT', other);
    await invoice('99.00', 'EUR', true, other);
    const grant = (await issue()).body.data;
    const response = await publicRead(grant.token);
    expect(response.status).toBe(200);
    const page = response.body.data;
    expect(page.projects).toEqual([
      {
        title: 'Client project',
        summary: 'Shared project brief',
        status: 'active',
        tasks: [
          {
            title: 'Shared task',
            description: 'Shared instructions',
            status: 'todo',
          },
        ],
        progress: { total: 1, done: 0, percentage: 0 },
      },
    ]);
    expect(page.invoices).toHaveLength(1);
    expect(page.invoices[0]).toMatchObject({
      totalMinor: 30,
      paidMinor: 10,
      remainingMinor: 20,
      paymentStatus: 'partially_paid',
      currency: 'EGP',
    });
    expect(JSON.stringify(page)).not.toMatch(
      /PRIVATE|OTHER CLIENT|requestId|digest|clientId|workspaceId|projectId|invoiceId|"id"|email|phone|priority|version/u,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-robots-tag']).toContain('noindex');
    expect(page.validForSeconds).toBe(7 * 86400);
  });
  it('owner preview matches the actual public allowlist without publishing a grant', async () => {
    await project();
    await invoice();
    const preview = await request(app)
      .get(route() + '/preview')
      .set('Authorization', 'Bearer ' + token);
    expect(preview.status).toBe(200);
    expect(await grants.countDocuments()).toBe(0);
    const grant = (await issue()).body.data;
    const page = (await publicRead(grant.token)).body.data;
    const { expiresAt, validForSeconds, ...content } = page;
    expect(expiresAt).toBe(grant.share.expiresAt);
    expect(validForSeconds).toBe(7 * 86400);
    expect(content).toEqual(preview.body.data);
  });
  it('live task visibility changes never expose hidden progress or absent legacy flags', async () => {
    const owned = await project();
    const board = await taskService.create(scope, owned.id, 0, {
      title: 'Hidden',
      description: 'PRIVATE',
      priority: 'normal',
    });
    const grant = (await issue()).body.data;
    expect(
      (await publicRead(grant.token)).body.data.projects[0].progress,
    ).toEqual({ total: 0, done: 0, percentage: null });
    await taskService.setClientVisibility(
      scope,
      owned.id,
      board.tasks[0]!.id,
      1,
      true,
    );
    expect(
      (await publicRead(grant.token)).body.data.projects[0].tasks,
    ).toHaveLength(1);
    await taskService.setClientVisibility(
      scope,
      owned.id,
      board.tasks[0]!.id,
      2,
      false,
    );
    expect(
      (await publicRead(grant.token)).body.data.projects[0].tasks,
    ).toHaveLength(0);
    await tasks.collection.updateOne(
      { project: new Types.ObjectId(owned.id) },
      { $unset: { 'tasks.0.clientVisible': '' } },
    );
    expect(
      (await publicRead(grant.token)).body.data.projects[0].tasks,
    ).toHaveLength(0);
  });
  it.each(['EGP', 'USD', 'EUR', 'SAR'])(
    'keeps exact %s partial/full/corrected balances',
    async (currency) => {
      const record = await invoice('0.30', currency),
        grant = (await issue()).body.data;
      const paid = await paymentService.add(
        scope,
        record.id,
        0,
        payment('0.10'),
      );
      await paymentService.add(scope, record.id, 1, payment('0.20'));
      expect(
        (await publicRead(grant.token)).body.data.invoices[0],
      ).toMatchObject({
        paidMinor: 30,
        remainingMinor: 0,
        paymentStatus: 'paid',
      });
      await paymentService.void(
        scope,
        record.id,
        paid.payments[0]!.id,
        2,
        'Wrong entry',
      );
      expect(
        (await publicRead(grant.token)).body.data.invoices[0],
      ).toMatchObject({
        paidMinor: 20,
        remainingMinor: 10,
        paymentStatus: 'partially_paid',
      });
    },
  );
  it('zero invoices are paid without fake entries and terminal projects retain visible history', async () => {
    const owned = await project();
    await projects.updateOne(
      { _id: owned.id },
      { $set: { status: 'completed' } },
    );
    await invoice('0.00');
    const grant = (await issue()).body.data;
    const page = (await publicRead(grant.token)).body.data;
    expect(page.projects[0].status).toBe('completed');
    expect(page.invoices[0].paymentStatus).toBe('paid');
    expect(await payments.countDocuments()).toBe(0);
  });
  it('automatically includes future same-client work but keeps future drafts private', async () => {
    const grant = (await issue()).body.data;
    expect((await publicRead(grant.token)).body.data.projects).toHaveLength(0);
    await project();
    await invoice('10.00', 'EGP', false);
    expect((await publicRead(grant.token)).body.data.projects).toHaveLength(1);
    expect((await publicRead(grant.token)).body.data.invoices).toHaveLength(0);
    const draft = await invoices.Invoice.findOne().orFail();
    await invoiceService.issue(scope, draft.id, 1, account.workspaceName);
    expect((await publicRead(grant.token)).body.data.invoices).toHaveLength(1);
  });
  it('excludes foreign workspace rows even when their client/project/invoice IDs point here', async () => {
    const owned = await project(),
      record = await invoice(),
      foreign = new Types.ObjectId();
    await projects.collection.insertOne({
      workspace: foreign,
      client: { id: new Types.ObjectId(clientId) },
      title: 'FOREIGN',
      summary: 'FOREIGN',
      status: 'active',
    });
    await invoices.Invoice.collection.insertOne({
      workspace: foreign,
      client: { id: new Types.ObjectId(clientId) },
      status: 'issued',
      totalMinor: 9999,
      currency: 'USD',
      number: 'FOREIGN',
      issuedAt: now,
    });
    await tasks.collection.insertOne({
      workspace: foreign,
      project: new Types.ObjectId(owned.id),
      tasks: [
        {
          clientVisible: true,
          title: 'FOREIGN',
          description: 'FOREIGN',
          status: 'done',
        },
      ],
    });
    await payments.collection.insertOne({
      workspace: foreign,
      invoice: new Types.ObjectId(record.id),
      entries: [{ amountMinor: 999, voidedAt: null }],
    });
    const grant = (await issue()).body.data,
      page = (await publicRead(grant.token)).body.data;
    expect(JSON.stringify(page)).not.toContain('FOREIGN');
    expect(page.projects).toHaveLength(1);
    expect(page.projects[0].tasks).toHaveLength(0);
    expect(page.invoices[0].paidMinor).toBe(0);
  });
  it('client archive immediately disables the portal and issuance, while revocation remains available', async () => {
    const grant = (await issue()).body.data;
    await clients.updateOne({ _id: clientId }, { $set: { archivedAt: now } });
    expect((await publicRead(grant.token)).status).toBe(404);
    expect((await issue(1)).status).toBe(409);
    expect((await read()).body.data.client.archived).toBe(true);
    expect((await revoke(1)).status).toBe(200);
  });
  it('deleted client or workspace disables a live public grant', async () => {
    const grant = (await issue()).body.data;
    await models.Workspace.deleteMany({});
    expect((await publicRead(grant.token)).status).toBe(404);
    await clients.deleteMany({});
    expect((await publicRead(grant.token)).status).toBe(404);
    expect(await grants.countDocuments()).toBe(1);
  });
  it('live membership and owning workspace guard all management and preview routes', async () => {
    const other = (
      await clients.create({ workspace: new Types.ObjectId(), name: 'Other' })
    ).id;
    expect(
      (
        await request(app)
          .get('/api/v1/clients/' + other + '/portal')
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(404);
    expect((await request(app).get(route() + '/preview')).status).toBe(401);
    await models.Membership.deleteMany({});
    expect((await read()).status).toBe(401);
    expect((await issue()).status).toBe(401);
  });
  it('renewal supersedes the old secret, increments only portal revision, and revocation is permanent', async () => {
    await project();
    await invoice();
    const before = await projects.find().lean(),
      beforeInvoices = await invoices.Invoice.find().lean();
    const old = (await issue()).body.data,
      fresh = (await issue(1, 1)).body.data;
    expect(fresh.version).toBe(2);
    expect((await publicRead(old.token)).status).toBe(404);
    expect((await publicRead(fresh.token)).status).toBe(200);
    const revoked = await revoke(2);
    expect(revoked.body.data.version).toBe(3);
    expect((await publicRead(fresh.token)).status).toBe(404);
    expect((await revoke(3)).body.data.version).toBe(3);
    expect((await revoke(2)).status).toBe(409);
    expect(await projects.find().lean()).toEqual(before);
    expect(await invoices.Invoice.find().lean()).toEqual(beforeInvoices);
    expect((await grants.findOne().lean().orFail()).digest).toBeNull();
  });
  it('expiry is exclusive at the exact boundary and uses server-relative seconds', async () => {
    const grant = (await issue(0, 1)).body.data;
    now = new Date(new Date(grant.share.expiresAt).getTime() - 1);
    expect((await publicRead(grant.token)).body.data.validForSeconds).toBe(1);
    now = new Date(now.getTime() + 1);
    expect((await publicRead(grant.token)).status).toBe(404);
    expect((await read()).body.data.share.state).toBe('expired');
    expect((await issue(1)).status).toBe(201);
  });
  it.each(['', 'bad', 'A'.repeat(43)])(
    'unknown/malformed secret %s is unavailable',
    async (secret) => {
      expect((await publicRead(secret)).body.error.code).toBe(
        'PORTAL_SHARE_UNAVAILABLE',
      );
      expect((await publicRead(secret)).status).toBe(404);
    },
  );
  it('concurrent first issuance has one winner and no orphan grants or client-version changes', async () => {
    const before = await clients.findById(clientId).lean().orFail();
    const responses = await Promise.all([issue(), issue()]);
    expect(responses.map((row) => row.status).sort()).toEqual([201, 409]);
    expect(await grants.countDocuments()).toBe(1);
    const after = await clients.findById(clientId).lean().orFail();
    expect(after.referenceRevision).toBe(before.referenceRevision + 1);
    expect(after.version).toBe(before.version);
  });
  it('concurrent renewal/revocation uses one shared grant CAS revision', async () => {
    await issue();
    const responses = await Promise.all([issue(1), revoke(1)]);
    expect(responses.filter((row) => row.status === 409)).toHaveLength(1);
    expect(
      responses.filter((row) => [200, 201].includes(row.status)),
    ).toHaveLength(1);
    expect((await read()).body.data.version).toBe(2);
  });
  it('failed first grant insertion rolls back the client reservation', async () => {
    const before = await clients.findById(clientId).lean().orFail();
    vi.spyOn(grants, 'create').mockRejectedValueOnce(
      new Error('PRIVATE DATABASE'),
    );
    const response = await issue();
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE');
    expect(await grants.countDocuments()).toBe(0);
    expect(await clients.findById(clientId).lean()).toEqual(before);
  });
  it('pagination is bounded, grant-bound, kind-bound and keeps all pages client-scoped', async () => {
    for (let i = 0; i < 7; i++) {
      await project('Project ' + i);
      await invoice();
    }
    const grant = (await issue()).body.data,
      secondGrantClient = (
        await clients.create({ workspace: scope, name: 'Another' })
      ).id;
    const other = await portal.issue(scope, secondGrantClient, 0, 7);
    const page = (await publicRead(grant.token)).body.data;
    expect(page.projects).toHaveLength(5);
    expect(page.invoices).toHaveLength(5);
    expect(page.nextProjectCursor).toMatch(/^[A-Za-z0-9_-]{54}$/u);
    expect(page.nextInvoiceCursor).toMatch(/^[A-Za-z0-9_-]{54}$/u);
    const next = (
      await publicRead(grant.token, {
        projects: page.nextProjectCursor,
        invoices: page.nextInvoiceCursor,
      })
    ).body.data;
    expect(next.projects).toHaveLength(2);
    expect(next.invoices).toHaveLength(2);
    expect(next.nextProjectCursor).toBeNull();
    expect(next.nextInvoiceCursor).toBeNull();
    expect(
      (await publicRead(other.token, { projects: page.nextProjectCursor }))
        .status,
    ).toBe(404);
    expect(
      (await publicRead(grant.token, { invoices: page.nextProjectCursor }))
        .status,
    ).toBe(404);
    expect((await publicRead(grant.token, { projects: 'bad' })).status).toBe(
      404,
    );
    expect(
      next.projects
        .map((item: { title: string }) => item.title)
        .some((title: string) =>
          page.projects.some((item: { title: string }) => item.title === title),
        ),
    ).toBe(false);
  });
  it('a payment committing after the first project read cannot mix into the same snapshot', async () => {
    await project();
    const record = await invoice(),
      grant = (await issue()).body.data;
    const collection = database.collection(models.Workspace.collection.name),
      find = collection.findOne.bind(collection);
    vi.spyOn(collection, 'findOne').mockImplementationOnce(
      async (filter, options) => {
        const row = await find(filter, options);
        await paymentService.add(scope, record.id, 0, payment('3.00'));
        return row;
      },
    );
    expect(
      (await publicRead(grant.token)).body.data.invoices[0].paidMinor,
    ).toBe(0);
    expect(
      (await publicRead(grant.token)).body.data.invoices[0].paidMinor,
    ).toBe(300);
  });
  it.each([0, 31, 1.5])('rejects invalid grant days %s', async (days) => {
    expect((await issue(0, days)).status).toBe(422);
    expect(await grants.countDocuments()).toBe(0);
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER])(
    'rejects invalid grant revision %s',
    async (version) => {
      expect((await issue(version)).status).toBe(422);
    },
  );
  it('strict management/public payloads cannot override client, workspace or data filters', async () => {
    expect(
      (
        await request(app)
          .post(route())
          .set('Authorization', 'Bearer ' + token)
          .send({ version: 0, days: 7, workspaceId: scope })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .get(route())
          .query({ clientId })
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(422);
    const grant = (await issue()).body.data;
    expect((await publicRead(grant.token, { clientId })).status).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/v1/public/portal/read?workspaceId=x')
          .send({ token: grant.token })
      ).status,
    ).toBe(404);
  });
  it('public read failures are safe errors, never empty or false paid summaries', async () => {
    vi.spyOn(portal, 'readPublic').mockRejectedValueOnce(
      new Error('PRIVATE CONNECTION'),
    );
    const response = await publicRead('A'.repeat(43));
    expect(response.status).toBe(500);
    expect(response.body.data).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE');
  });
  it('rate limits anonymous reads and keeps unavailable responses private', async () => {
    const responses = await Promise.all(
      Array.from({ length: 61 }, () => publicRead('bad')),
    );
    expect(responses.filter((row) => row.status === 404)).toHaveLength(60);
    expect(responses.filter((row) => row.status === 429)).toHaveLength(1);
    const limited = responses.find((row) => row.status === 429)!;
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
  it('no public mutation/GET/state route and portal secrets do not authorize owner sessions', async () => {
    const grant = (await issue()).body.data;
    expect((await request(app).get('/api/v1/public/portal/read')).status).toBe(
      404,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/public/portal/revoke')
          .send({ token: grant.token })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(route())
          .set('Authorization', 'Bearer ' + grant.token)
      ).status,
    ).toBe(401);
  });
});
