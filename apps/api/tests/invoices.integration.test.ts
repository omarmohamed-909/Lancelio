import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { createApp } from '../src/main/create-app.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { connectDatabase } from '../src/main/database.js';
import { createInvoiceSharing } from '../src/main/create-invoice-sharing.js';
import { createInvoices } from '../src/main/create-invoices.js';
import {
  createInvoiceModels,
  initializeInvoiceModels,
} from '../src/modules/invoices/infrastructure/invoice-model.js';
import { createProjectModel } from '../src/modules/projects/infrastructure/project-model.js';
import { createClientModel } from '../src/modules/clients/infrastructure/client-model.js';
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
  email: 'invoice@example.com',
  password: 'invoice test secure passphrase',
};
describe('Transactional invoice numbering, references and isolation', () => {
  let replica: MongoMemoryReplSet,
    database: Awaited<ReturnType<typeof connectDatabase>>,
    models: ReturnType<typeof createRegistrationModels>,
    invoices: ReturnType<typeof createInvoiceModels>,
    clients: ReturnType<typeof createClientModel>,
    projects: ReturnType<typeof createProjectModel>,
    sessionModel: ReturnType<typeof createSessionModel>,
    sessions: Awaited<ReturnType<typeof createAuthentication>>,
    register: RegisterAccount,
    service: ReturnType<typeof createInvoices>,
    app: ReturnType<typeof createApp>,
    token: string,
    workspaceId: string,
    clientId: string;
  let invoiceNow: Date;
  let sharing: ReturnType<typeof createInvoiceSharing>;
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
    database = await connectDatabase(replica.getUri('invoice-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    invoices = createInvoiceModels(database);
    await initializeInvoiceModels(invoices);
    clients = createClientModel(database);
    await clients.createCollection();
    await clients.createIndexes();
    projects = createProjectModel(database);
    await projects.createCollection();
    await projects.createIndexes();
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    sessions = await createAuthentication(
      models,
      sessionModel,
      'invoice-tests-signing-secret-at-least-32-characters',
      false,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    service = createInvoices(
      database,
      invoices,
      clients,
      projects,
      () => invoiceNow,
    );
    sharing = createInvoiceSharing(invoices, () => invoiceNow);
  }, 240000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    invoiceNow = new Date();
    await Promise.all([
      invoices.Invoice.deleteMany({}),
      invoices.Counter.deleteMany({}),
      clients.deleteMany({}),
      projects.deleteMany({}),
      sessionModel.deleteMany({}),
      models.Membership.deleteMany({}),
      models.Workspace.deleteMany({}),
      models.User.deleteMany({}),
    ]);
    await register.execute(account);
    const login = await sessions.login.execute(account);
    token = login.accessToken;
    workspaceId = login.identity.workspace.id;
    clientId = (
      await clients.create({
        workspace: workspaceId,
        name: 'شركة ورقة',
        email: 'client@example.com',
        notes: 'SECRET OWNER NOTE',
      })
    )._id.toString();
    app = createApp('http://localhost:3000', {
      sessions,
      invoices: service,
      invoiceSharing: sharing,
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replica?.stop();
  });
  const body = () => ({
    requestId: randomUUID(),
    clientId,
    projectId: null,
    title: 'فاتورة تصميم الموقع',
    summary: 'نطاق التنفيذ',
    terms: 'شروط الاتفاق',
    currency: 'EGP',
    items: [
      { title: 'تصميم', quantity: 3, unitPrice: '0.10' },
      { title: 'مراجعة', quantity: 1, unitPrice: '0.20' },
    ],
  });
  const create = (override: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/invoices')
      .set('Authorization', 'Bearer ' + token)
      .send({ ...body(), ...override });
  it('creates a safe DTO with exact server totals and a fixed number', async () => {
    const before = await clients.findById(clientId).orFail();
    const result = await create();
    expect(result.status).toBe(201);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toMatchObject({
      number: 'INV-000001',
      sequence: 1,
      totalMinor: 50,
      itemCount: 2,
      status: 'draft',
      version: 1,
      project: null,
    });
    expect(Object.keys(result.body.data).sort()).toEqual(
      [
        'id',
        'number',
        'sequence',
        'title',
        'client',
        'project',
        'status',
        'currency',
        'totalMinor',
        'itemCount',
        'version',
        'createdAt',
        'updatedAt',
        'issuedAt',
        'senderName',
        'summary',
        'terms',
        'items',
      ].sort(),
    );
    expect(JSON.stringify(result.body)).not.toContain('SECRET OWNER NOTE');
    expect(JSON.stringify(result.body)).not.toContain('requestId');
    const after = await clients.findById(clientId).orFail();
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
  it('keeps saved client and project references when the contact changes', async () => {
    const project = await projects.create({
      workspace: workspaceId,
      title: 'الموقع المتفق عليه',
      client: { id: clientId, name: 'اسم قديم' },
      items: [],
      status: 'completed',
    });
    const result = await create({ projectId: project._id.toString() });
    expect(result.status).toBe(201);
    await clients.updateOne(
      { _id: clientId },
      { $set: { name: 'اسم جديد', archivedAt: new Date() } },
    );
    const read = await request(app)
      .get('/api/v1/invoices/' + result.body.data.id)
      .set('Authorization', 'Bearer ' + token);
    expect(read.body.data.client.name).toBe('شركة ورقة');
    expect(read.body.data.project).toEqual({
      id: project._id.toString(),
      title: project.title,
      clientId,
    });
    expect((await projects.findById(project._id).orFail()).version).toBe(1);
  });
  it('rejects archived clients without consuming a number', async () => {
    await clients.updateOne(
      { _id: clientId },
      { $set: { archivedAt: new Date() } },
    );
    expect((await create()).status).toBe(422);
    expect(await invoices.Invoice.countDocuments()).toBe(0);
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(0);
  });
  it.each(['missing', 'different-client', 'different-workspace'])(
    'rejects a %s project and rolls back client reservation',
    async (kind) => {
      let projectId = 'abcdef123456abcdef123456';
      if (kind !== 'missing') {
        const project = await projects.create({
          workspace:
            kind === 'different-workspace'
              ? 'abcdef123456abcdef123456'
              : workspaceId,
          title: 'مشروع آخر',
          client: {
            id:
              kind === 'different-client'
                ? 'abcdef123456abcdef123456'
                : clientId,
            name: 'عميل',
          },
          items: [],
        });
        projectId = project._id.toString();
      }
      expect((await create({ projectId })).body.error.code).toBe(
        'INVOICE_PROJECT_UNAVAILABLE',
      );
      expect(await invoices.Invoice.countDocuments()).toBe(0);
      expect(
        (await clients.findById(clientId).orFail()).referenceRevision,
      ).toBe(0);
    },
  );
  it('uses an independent sequence per workspace and hides foreign records', async () => {
    const input = body();
    const first = await create(input);
    await register.execute({ ...account, email: 'second@example.com' });
    const second = await sessions.login.execute({
      ...account,
      email: 'second@example.com',
    });
    const foreignClient = await clients.create({
      workspace: second.identity.workspace.id,
      name: 'عميل آخر',
    });
    const foreign = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', 'Bearer ' + second.accessToken)
      .send({ ...input, clientId: foreignClient._id.toString() });
    expect(foreign.body.data.number).toBe('INV-000001');
    expect(
      (await create({ clientId: foreignClient._id.toString() })).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .get('/api/v1/invoices/' + foreign.body.data.id)
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(404);
    const list = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', 'Bearer ' + token);
    expect(list.body.data.items.map((row: { id: string }) => row.id)).toEqual([
      first.body.data.id,
    ]);
  });
  it('allocates unique consecutive numbers under simultaneous first creations', async () => {
    const alternate = await clients.create({
      workspace: workspaceId,
      name: 'عميل آخر',
    });
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        create({ clientId: i % 2 ? clientId : alternate._id.toString() }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual(Array(12).fill(201));
    expect(
      results.map((result) => result.body.data.sequence).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(await invoices.Invoice.countDocuments()).toBe(12);
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(12);
  });
  it('concurrent repetition of one request creates one invoice and consumes one number', async () => {
    const input = body();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => create(input)),
    );
    expect(results.map((result) => result.status)).toEqual(Array(8).fill(201));
    expect(new Set(results.map((result) => result.body.data.id)).size).toBe(1);
    expect(await invoices.Invoice.countDocuments()).toBe(1);
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(1);
  });
  it('replays committed content after client archive but rejects a changed payload', async () => {
    const input = body();
    const first = await create(input);
    await clients.updateOne(
      { _id: clientId },
      { $set: { archivedAt: new Date() } },
    );
    const repeated = await create({
      ...input,
      title: ' ' + input.title + ' ',
      requestId: input.requestId.toUpperCase(),
      clientId: clientId.toUpperCase(),
      items: input.items.map((item) => ({
        ...item,
        title: ' ' + item.title + ' ',
        unitPrice: item.unitPrice === '0.10' ? '0.1' : item.unitPrice,
      })),
    });
    expect(repeated.body.data).toEqual(first.body.data);
    const changed = await create({ ...input, title: 'فاتورة أخرى' });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('INVOICE_REQUEST_CONFLICT');
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(1);
  });
  it('rolls back a failed invoice insert including number and client reservation', async () => {
    vi.spyOn(invoices.Invoice, 'create').mockRejectedValueOnce(
      new Error('forced insertion failure'),
    );
    expect((await create()).status).toBe(500);
    expect(await invoices.Invoice.countDocuments()).toBe(0);
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(0);
    expect((await clients.findById(clientId).orFail()).referenceRevision).toBe(
      0,
    );
    expect((await create()).body.data.number).toBe('INV-000001');
  });
  it('enforces the database sequence and request uniqueness constraints', async () => {
    await create();
    const stored = await invoices.Invoice.findOne().orFail();
    const record = stored.toObject();
    const content = { ...record };
    Reflect.deleteProperty(content, '_id');
    await expect(
      invoices.Invoice.create({ ...content, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      invoices.Invoice.create({
        ...content,
        sequence: 2,
        number: 'INV-000002',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
  it('fails closed at the safe numbering limit without partial writes', async () => {
    await invoices.Counter.create({
      _id: workspaceId,
      sequence: Number.MAX_SAFE_INTEGER,
    });
    expect((await create()).body.error.code).toBe('INVOICE_NUMBER_EXHAUSTED');
    expect(await invoices.Invoice.countDocuments()).toBe(0);
    expect((await clients.findById(clientId).orFail()).referenceRevision).toBe(
      0,
    );
  });
  it('pages newest first in sets of 25 without exposing full invoice contents', async () => {
    for (let i = 0; i < 27; i++) await service.create(workspaceId, body());
    const first = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', 'Bearer ' + token);
    expect(first.body.data.items).toHaveLength(25);
    expect(first.body.data.items[0].sequence).toBe(27);
    expect(first.body.data.items[0]).not.toHaveProperty('items');
    const second = await request(app)
      .get('/api/v1/invoices?cursor=' + first.body.data.nextCursor)
      .set('Authorization', 'Bearer ' + token);
    expect(second.body.data.items).toHaveLength(2);
    expect(second.body.data.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.body.data.items, ...second.body.data.items].map(
          (row: { id: string }) => row.id,
        ),
      ).size,
    ).toBe(27);
  });
  it.each([
    { workspaceId: 'abcdef123456abcdef123456' },
    { number: 'INV-999999' },
    { totalMinor: 1 },
    { status: 'paid' },
    { version: 20 },
    { items: [{ title: 'شغل', quantity: 1, unitPrice: '1', totalMinor: 1 }] },
    { requestId: 'invalid' },
    { projectId: 'invalid' },
    { items: [{ title: 'شغل', quantity: 1, unitPrice: 2 }] },
  ])('rejects untrusted fields or malformed input %j', async (override) => {
    expect((await create(override)).status).toBe(422);
    expect(await invoices.Invoice.countDocuments()).toBe(0);
  });
  it('requires authentication and live workspace membership', async () => {
    expect((await request(app).get('/api/v1/invoices')).status).toBe(401);
    await models.Membership.deleteMany({});
    expect((await create()).status).toBe(401);
  });
  it('rejects unsupported queries and invalid identifiers', async () => {
    expect(
      (
        await request(app)
          .get('/api/v1/invoices?status=paid')
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .get('/api/v1/invoices?cursor=bad')
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .get('/api/v1/invoices/bad')
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .post('/api/v1/invoices?workspaceId=bad')
          .set('Authorization', 'Bearer ' + token)
          .send(body())
      ).status,
    ).toBe(422);
  });
  it('rejects creation keys on edit and has no delete or public record-id endpoint', async () => {
    const first = await create();
    expect(
      (
        await request(app)
          .put('/api/v1/invoices/' + first.body.data.id)
          .set('Authorization', 'Bearer ' + token)
          .send(body())
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .delete('/api/v1/invoices/' + first.body.data.id)
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/v1/public/invoices/' + first.body.data.id))
        .status,
    ).toBe(404);
  });
  const auth = () => 'Bearer ' + token;
  const editInvoice = (
    id: string,
    version: number,
    override: Record<string, unknown> = {},
  ) => {
    const { requestId, ...content } = body();
    void requestId;
    return request(app)
      .put('/api/v1/invoices/' + id)
      .set('Authorization', auth())
      .send({ ...content, version, ...override });
  };
  const issueInvoice = (id: string, version: number = 1) =>
    request(app)
      .post('/api/v1/invoices/' + id + '/issue')
      .set('Authorization', auth())
      .send({ version });
  const issueLink = (id: string, version: number = 2, days: number = 7) =>
    request(app)
      .post('/api/v1/invoices/' + id + '/share')
      .set('Authorization', auth())
      .send({ version, days });
  const revokeLink = (id: string, version: number) =>
    request(app)
      .post('/api/v1/invoices/' + id + '/share/revoke')
      .set('Authorization', auth())
      .send({ version });
  const publicRead = (token: string) =>
    request(app).post('/api/v1/public/invoices/read').send({ token });
  it('edits exact draft contents with stable number and version but no extra allocation', async () => {
    const first = await create();
    const result = await editInvoice(first.body.data.id, 1, {
      title: 'تعديل النطاق',
      currency: 'USD',
      items: [{ title: 'مراجعة', quantity: 3, unitPrice: '1.25' }],
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      number: 'INV-000001',
      sequence: 1,
      version: 2,
      totalMinor: 375,
      currency: 'USD',
      status: 'draft',
      issuedAt: null,
      senderName: null,
    });
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(1);
  });
  it('allows only one concurrent draft edit and preserves the winner', async () => {
    const first = await create();
    const results = await Promise.all([
      editInvoice(first.body.data.id, 1, { title: 'تعديل أول' }),
      editInvoice(first.body.data.id, 1, { title: 'تعديل ثاني' }),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([200, 409]);
    expect(
      (await invoices.Invoice.findById(first.body.data.id).orFail()).version,
    ).toBe(2);
  });
  it('keeps an archived current client but rejects switching to another archived client', async () => {
    const first = await create();
    await clients.updateOne(
      { _id: clientId },
      { $set: { archivedAt: new Date() } },
    );
    expect((await editInvoice(first.body.data.id, 1)).status).toBe(200);
    const other = await clients.create({
      workspace: workspaceId,
      name: 'عميل مؤرشف',
      archivedAt: new Date(),
    });
    expect(
      (
        await editInvoice(first.body.data.id, 2, {
          clientId: other._id.toString(),
        })
      ).status,
    ).toBe(422);
  });
  it('revalidates project/client scope on edit and leaves contents/version unchanged on failure', async () => {
    const first = await create();
    const bad = await editInvoice(first.body.data.id, 1, {
      projectId: 'abcdef123456abcdef123456',
    });
    expect(bad.body.error.code).toBe('INVOICE_PROJECT_UNAVAILABLE');
    expect(
      (await invoices.Invoice.findById(first.body.data.id).orFail()).version,
    ).toBe(1);
  });
  it('captures current contact and sender at issuance and keeps them fixed through renewed links', async () => {
    const first = await create();
    await clients.updateOne(
      { _id: clientId },
      { $set: { name: 'اسم وقت الإصدار', company: 'شركة الإصدار' } },
    );
    const issued = await issueInvoice(first.body.data.id);
    expect(issued.status).toBe(200);
    expect(issued.body.data).toMatchObject({
      status: 'issued',
      version: 2,
      senderName: 'Ahmed',
      issuedAt: invoiceNow.toISOString(),
      client: { name: 'اسم وقت الإصدار', company: 'شركة الإصدار' },
    });
    const link = await issueLink(first.body.data.id);
    await clients.updateOne({ _id: clientId }, { $set: { name: 'اسم لاحق' } });
    const renewal = await issueLink(first.body.data.id, 3);
    const publicDoc = await publicRead(renewal.body.data.token);
    expect(publicDoc.body.data.client.name).toBe('اسم وقت الإصدار');
    expect(publicDoc.body.data.issuedAt).toBe(invoiceNow.toISOString());
    expect(publicDoc.body.data.senderName).toBe('Ahmed');
    expect((await publicRead(link.body.data.token)).status).toBe(404);
  });
  it('issues a saved draft for its archived client without changing public client revision', async () => {
    const first = await create();
    await clients.updateOne(
      { _id: clientId },
      { $set: { archivedAt: new Date() } },
    );
    const before = await clients.findById(clientId).orFail();
    expect((await issueInvoice(first.body.data.id)).status).toBe(200);
    const after = await clients.findById(clientId).orFail();
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
  it('concurrent issuance commits one immutable document', async () => {
    const first = await create();
    const results = await Promise.all([
      issueInvoice(first.body.data.id),
      issueInvoice(first.body.data.id),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([200, 409]);
    const saved = await invoices.Invoice.findById(first.body.data.id).orFail();
    expect(saved.status).toBe('issued');
    expect(saved.version).toBe(2);
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(1);
  });
  it('serializes issuance with editing and never changes issued prices', async () => {
    const first = await create();
    const [issued, edited] = await Promise.all([
      issueInvoice(first.body.data.id),
      editInvoice(first.body.data.id, 1, {
        items: [{ title: 'نطاق جديد', quantity: 1, unitPrice: '999' }],
      }),
    ]);
    expect([issued.status, edited.status].sort()).toEqual([200, 409]);
    const saved = await invoices.Invoice.findById(first.body.data.id).orFail();
    expect(saved.version).toBe(2);
    expect(saved.totalMinor).toBe(issued.status === 200 ? 50 : 99900);
    if (issued.status === 200)
      expect((await editInvoice(saved._id.toString(), 2)).body.error.code).toBe(
        'INVOICE_LOCKED',
      );
  });
  it('rolls back failed issuance including client reservation and legacy fingerprint', async () => {
    const first = await create();
    await invoices.Invoice.updateOne(
      { _id: first.body.data.id },
      { $unset: { creationFingerprint: 1 } },
    );
    const before = await clients.findById(clientId).orFail();
    vi.spyOn(invoices.Invoice, 'findOneAndUpdate').mockRejectedValueOnce(
      new Error('forced issue failure'),
    );
    expect((await issueInvoice(first.body.data.id)).status).toBe(500);
    const saved = await invoices.Invoice.findById(first.body.data.id)
      .lean()
      .orFail();
    expect(saved.status).toBe('draft');
    expect(saved.version).toBe(1);
    expect(saved.issuedAt).toBeNull();
    expect(saved.creationFingerprint).toBeUndefined();
    expect((await clients.findById(clientId).orFail()).referenceRevision).toBe(
      before.referenceRevision,
    );
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(1);
  });
  it('preserves original creation replay after editing and issuance', async () => {
    const input = body();
    const first = await create(input);
    await editInvoice(first.body.data.id, 1, { title: 'عنوان بعد التعديل' });
    await issueInvoice(first.body.data.id, 2);
    const replay = await create(input);
    expect(replay.status).toBe(201);
    expect(replay.body.data).toMatchObject({
      id: first.body.data.id,
      title: 'عنوان بعد التعديل',
      status: 'issued',
      version: 3,
    });
    expect(
      (await create({ ...input, title: 'عنوان بعد التعديل' })).status,
    ).toBe(409);
    expect(
      (await invoices.Counter.findById(workspaceId).orFail()).sequence,
    ).toBe(1);
  });
  it.each(['edit', 'issue'])(
    'preserves legacy INV-001 creation identity before %s',
    async (action) => {
      const input = body(),
        first = await create(input);
      await invoices.Invoice.updateOne(
        { _id: first.body.data.id },
        { $unset: { creationFingerprint: 1, issuedAt: 1, senderName: 1 } },
      );
      if (action === 'edit')
        expect(
          (await editInvoice(first.body.data.id, 1, { title: 'نسخة محدثة' }))
            .status,
        ).toBe(200);
      else expect((await issueInvoice(first.body.data.id)).status).toBe(200);
      expect((await create(input)).body.data.id).toBe(first.body.data.id);
      expect(
        (await invoices.Invoice.findById(first.body.data.id).orFail())
          .creationFingerprint,
      ).toMatch(/^[a-f0-9]{64}$/u);
    },
  );
  it('has a scoped empty share state and refuses to publish a draft', async () => {
    const first = await create();
    const state = await request(app)
      .get('/api/v1/invoices/' + first.body.data.id + '/share')
      .set('Authorization', auth());
    expect(state.body.data).toMatchObject({
      invoiceVersion: 1,
      invoiceStatus: 'draft',
      share: null,
    });
    expect((await issueLink(first.body.data.id, 1)).body.error.code).toBe(
      'INVOICE_NOT_ISSUED',
    );
  });
  it('stores only a digest and returns an anonymous safe invoice document', async () => {
    const first = await create();
    await issueInvoice(first.body.data.id);
    const link = await issueLink(first.body.data.id);
    expect(link.status).toBe(201);
    expect(link.body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const stored = await invoices.Invoice.findById(first.body.data.id).orFail();
    expect(stored.share?.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(stored.share?.digest).not.toBe(link.body.data.token);
    expect(JSON.stringify(stored)).not.toContain(link.body.data.token);
    const publicDoc = await publicRead(link.body.data.token);
    expect(publicDoc.status).toBe(200);
    expect(publicDoc.headers['cache-control']).toBe('no-store');
    expect(publicDoc.headers['referrer-policy']).toBe('no-referrer');
    expect(publicDoc.headers['x-robots-tag']).toContain('noindex');
    expect(Object.keys(publicDoc.body.data).sort()).toEqual(
      [
        'number',
        'title',
        'summary',
        'terms',
        'currency',
        'items',
        'totalMinor',
        'status',
        'client',
        'senderName',
        'issuedAt',
        'expiresAt',
        'validForSeconds',
      ].sort(),
    );
    expect(publicDoc.body.data.client).toEqual({
      name: 'شركة ورقة',
      company: '',
    });
    expect(JSON.stringify(publicDoc.body)).not.toContain('SECRET OWNER NOTE');
    expect(JSON.stringify(publicDoc.body)).not.toContain('client@example.com');
    expect(JSON.stringify(publicDoc.body)).not.toContain(clientId);
    expect(JSON.stringify(publicDoc.body)).not.toContain(workspaceId);
    expect(JSON.stringify(publicDoc.body)).not.toContain('creationFingerprint');
  });
  it('new grants expire the old one while issuance date and number stay fixed', async () => {
    const first = await create();
    await issueInvoice(first.body.data.id);
    const issuedAt = invoiceNow.toISOString(),
      link = await issueLink(first.body.data.id);
    invoiceNow = new Date(invoiceNow.getTime() + 3600000);
    const renewed = await issueLink(first.body.data.id, 3, 30);
    expect(renewed.status).toBe(201);
    expect((await publicRead(link.body.data.token)).status).toBe(404);
    const publicDoc = await publicRead(renewed.body.data.token);
    expect(publicDoc.body.data.number).toBe('INV-000001');
    expect(publicDoc.body.data.issuedAt).toBe(issuedAt);
    expect(publicDoc.body.data.validForSeconds).toBe(30 * 86400);
  });
  it('revocation permanently invalidates that link without unlocking invoice contents', async () => {
    const first = await create();
    await issueInvoice(first.body.data.id);
    const link = await issueLink(first.body.data.id);
    const revoked = await revokeLink(first.body.data.id, 3);
    expect(revoked.body.data.share.state).toBe('revoked');
    expect((await publicRead(link.body.data.token)).status).toBe(404);
    expect((await editInvoice(first.body.data.id, 4)).body.error.code).toBe(
      'INVOICE_LOCKED',
    );
    expect((await issueInvoice(first.body.data.id, 4)).body.error.code).toBe(
      'INVOICE_LOCKED',
    );
    expect(
      (await revokeLink(first.body.data.id, 4)).body.data.invoiceVersion,
    ).toBe(4);
  });
  it('expires at the exact grant boundary and a renewed grant remains possible', async () => {
    const first = await create();
    await issueInvoice(first.body.data.id);
    const link = await issueLink(first.body.data.id, 2, 1);
    invoiceNow = new Date(invoiceNow.getTime() + 86400000);
    expect((await publicRead(link.body.data.token)).status).toBe(404);
    const owner = await request(app)
      .get('/api/v1/invoices/' + first.body.data.id + '/share')
      .set('Authorization', auth());
    expect(owner.body.data.share.state).toBe('expired');
    expect((await issueLink(first.body.data.id, 3)).status).toBe(201);
  });
  it('concurrent grants and renewal/revocation respect the same reviewed revision', async () => {
    const first = await create();
    await issueInvoice(first.body.data.id);
    const results = await Promise.all([
      issueLink(first.body.data.id),
      issueLink(first.body.data.id),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([201, 409]);
    const winner = results.find((row) => row.status === 201)!;
    const next = await Promise.all([
      issueLink(first.body.data.id, 3),
      revokeLink(first.body.data.id, 3),
    ]);
    expect(
      next.filter((row) => row.status === 201 || row.status === 200),
    ).toHaveLength(1);
    expect(next.filter((row) => row.status === 409)).toHaveLength(1);
    expect((await publicRead(winner.body.data.token)).status).toBe(404);
  });
  it('rejects foreign access to all invoice write/share operations', async () => {
    const foreign = await invoices.Invoice.create({
      workspace: 'abcdef123456abcdef123456',
      requestId: randomUUID(),
      sequence: 1,
      number: 'INV-000001',
      title: 'فاتورة أخرى',
      currency: 'EGP',
      items: [
        { title: 'شغل', quantity: 1, unitPriceMinor: 100, totalMinor: 100 },
      ],
      itemCount: 1,
      totalMinor: 100,
      client: { id: clientId, name: 'عميل' },
    });
    for (const result of [
      await editInvoice(foreign._id.toString(), 1),
      await issueInvoice(foreign._id.toString()),
      await issueLink(foreign._id.toString()),
      await revokeLink(foreign._id.toString(), 1),
      await request(app)
        .get('/api/v1/invoices/' + foreign._id + '/share')
        .set('Authorization', auth()),
    ])
      expect(result.status).toBe(404);
  });
  it.each([0, -1, 1.5, 31, Number.MAX_SAFE_INTEGER])(
    'rejects invalid sharing lifetime %j without changing grant/version',
    async (days) => {
      const first = await create();
      await issueInvoice(first.body.data.id);
      expect((await issueLink(first.body.data.id, 2, days)).status).toBe(422);
      expect(
        (await invoices.Invoice.findById(first.body.data.id).orFail()).version,
      ).toBe(2);
    },
  );
  it.each(['', 'bad', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(101)])(
    'does not expose records for invalid or unknown tokens %j',
    async (secret) => expect((await publicRead(secret)).status).toBe(404),
  );
  it('fails closed for a draft with an injected grant and rate-limits anonymous reads', async () => {
    const first = await create();
    await issueInvoice(first.body.data.id);
    const link = await issueLink(first.body.data.id);
    await invoices.Invoice.updateOne(
      { _id: first.body.data.id },
      { $set: { status: 'draft' } },
    );
    expect((await publicRead(link.body.data.token)).status).toBe(404);
    const results = [];
    for (let i = 0; i < 60; i++)
      results.push((await publicRead('invalid')).status);
    expect(results).toContain(429);
  });
  it('rejects query/body mass assignment on edits, issuance and sharing', async () => {
    const first = await create();
    expect(
      (await editInvoice(first.body.data.id, 1, { number: 'INV-999999' }))
        .status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .post('/api/v1/invoices/' + first.body.data.id + '/issue')
          .set('Authorization', auth())
          .send({ version: 1, senderName: 'Spoofed' })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .get('/api/v1/invoices/' + first.body.data.id + '/share?token=secret')
          .set('Authorization', auth())
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .post('/api/v1/public/invoices/read')
          .send({ token: 'a'.repeat(43), workspaceId })
      ).status,
    ).toBe(404);
  });
});
