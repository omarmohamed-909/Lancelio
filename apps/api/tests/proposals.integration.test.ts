import { initializeProjectModel } from '../src/modules/projects/infrastructure/project-model.js';
import { MongoProjectStore } from '../src/modules/projects/infrastructure/mongo-project-store.js';
import { randomUUID } from 'node:crypto';
import { MongoProposalDecisionStore } from '../src/modules/proposals/infrastructure/mongo-proposal-decision-store.js';
import { createProposalDecisions } from '../src/main/create-proposal-decisions.js';
import { createProjectModel } from '../src/modules/projects/infrastructure/project-model.js';
import { createProjects } from '../src/main/create-projects.js';
import { createProposalSharing } from '../src/main/create-proposal-sharing.js';
import { createProposals } from '../src/main/create-proposals.js';
import { createProposalModel } from '../src/modules/proposals/infrastructure/proposal-model.js';
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
import { connectDatabase } from '../src/main/database.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { createConsumedRefreshModel } from '../src/modules/auth/infrastructure/consumed-refresh-model.js';
import { createClients } from '../src/main/create-clients.js';
import { createClientModel } from '../src/modules/clients/infrastructure/client-model.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
const origin = 'http://localhost:3000';
const account = {
  name: 'Ahmed',
  email: 'ahmed@example.com',
  password: 'a secure password for clients tests',
};
const details = {
  name: '  سارة علي  ',
  email: ' SARA@Example.com ',
  phone: '+20 100 555 4444',
  company: 'استوديو سارة',
  notes: 'يفضل التواصل بالبريد',
};
describe('Transactional draft proposals and workspace isolation', () => {
  let replica: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let clientModel: ReturnType<typeof createClientModel>;
  let sessionModel: ReturnType<typeof createSessionModel>;
  let consumed: ReturnType<typeof createConsumedRefreshModel>;
  let register: RegisterAccount;
  let sessions: Awaited<ReturnType<typeof createAuthentication>>;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let workspaceId: string;
  let clientId: string;
  let projectModel: ReturnType<typeof createProjectModel>;
  let proposalModel: ReturnType<typeof createProposalModel>;
  let proposals: ReturnType<typeof createProposals>;
  let sharing: ReturnType<typeof createProposalSharing>;
  let shareNow: Date;
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
    database = await connectDatabase(replica.getUri('proposal-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    proposalModel = createProposalModel(database);
    await proposalModel.createCollection();
    await proposalModel.createIndexes();
    projectModel = createProjectModel(database);
    await projectModel.createCollection();
    await projectModel.createIndexes();
    clientModel = createClientModel(database);
    await clientModel.createCollection();
    await clientModel.createIndexes();
    proposals = createProposals(database, proposalModel, clientModel);
    sharing = createProposalSharing(proposalModel, () => shareNow);
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    sessions = await createAuthentication(
      models,
      sessionModel,
      'clients-test-signing-secret-at-least-32-characters',
      false,
    );
    consumed = createConsumedRefreshModel(database);
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
  }, 240_000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    await proposalModel.deleteMany({});
    await projectModel.deleteMany({});
    await clientModel.deleteMany({});
    await consumed.deleteMany({});
    await sessionModel.deleteMany({});
    await models.Membership.deleteMany({});
    await models.Workspace.deleteMany({});
    await models.User.deleteMany({});
    shareNow = new Date();
    app = createApp(origin, {
      decisions: createProposalDecisions(
        database,
        proposalModel,
        projectModel,
        () => shareNow,
      ),
      projects: createProjects(database, projectModel, clientModel),
      sharing,
      sessions,
      proposals,
      clients: createClients(clientModel),
    });
    await register.execute(account);
    const login = await sessions.login.execute(account);
    token = login.accessToken;
    workspaceId = login.identity.workspace.id;
    clientId = (
      await clientModel.create({
        workspace: workspaceId,
        ...details,
        name: 'سارة علي',
        email: 'sara@example.com',
      })
    )._id.toString();
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replica?.stop();
  });
  const auth = () => `Bearer ${token}`;
  const content = {
    title: 'تصميم موقع',
    summary: 'نطاق العمل',
    terms: 'الدفع بعد التسليم',
    currency: 'EGP',
    items: [
      { title: 'الصفحة الرئيسية', quantity: 3, unitPrice: '0.10' },
      { title: 'تجربة الاستخدام', quantity: 1, unitPrice: '0.20' },
    ],
  };
  function create(overrides: Record<string, unknown> = {}) {
    return request(app)
      .post('/api/v1/proposals')
      .set('Authorization', auth())
      .send({ ...content, clientId, ...overrides });
  }
  function update(
    id: string,
    version = 1,
    overrides: Record<string, unknown> = {},
  ) {
    return request(app)
      .put('/api/v1/proposals/' + id)
      .set('Authorization', auth())
      .send({ ...content, clientId, version, ...overrides });
  }
  it('creates a draft, returns exact computed totals and a safe client snapshot', async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      status: 'draft',
      version: 1,
      totalMinor: 50,
      itemCount: 2,
      client: { id: clientId, name: 'سارة علي', email: 'sara@example.com' },
    });
    expect(
      response.body.data.items.map(
        (item: { totalMinor: number }) => item.totalMinor,
      ),
    ).toEqual([30, 20]);
    expect(response.body.data.workspace).toBeUndefined();
    expect(response.body.data.client.notes).toBeUndefined();
    expect(response.body.data._id).toBeUndefined();
    expect(response.body.data.items[0]._id).toBeUndefined();
    const client = await clientModel.findById(clientId).orFail();
    expect(client.referenceRevision).toBe(1);
    expect(client.version).toBe(1);
    expect(
      (
        await request(app)
          .get('/api/v1/proposals/' + response.body.data.id)
          .set('Authorization', auth())
      ).body.data.totalMinor,
    ).toBe(50);
  });
  it('supports name-only clients and refreshes active contact snapshots only on an explicit draft save', async () => {
    const minimal = await clientModel.create({
      workspace: workspaceId,
      name: 'عميل بدون بريد',
    });
    expect((await create({ clientId: minimal._id.toString() })).status).toBe(
      201,
    );
    const saved = (await create()).body.data;
    await clientModel.updateOne(
      { _id: clientId },
      { name: 'اسم أحدث', email: 'new@example.com' },
    );
    expect(
      (
        await request(app)
          .get('/api/v1/proposals/' + saved.id)
          .set('Authorization', auth())
      ).body.data.client.name,
    ).toBe('سارة علي');
    const updated = await update(saved.id, 1, { title: 'عنوان أحدث' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.client.name).toBe('اسم أحدث');
    expect(updated.body.data.client.email).toBe('new@example.com');
    expect(updated.body.data.version).toBe(2);
  });
  it('rejects foreign, missing and archived clients consistently without creating partial records', async () => {
    await register.execute({ ...account, email: 'other@example.com' });
    const foreign = await sessions.login.execute({
      ...account,
      email: 'other@example.com',
    });
    const outside = await clientModel.create({
      workspace: foreign.identity.workspace.id,
      name: 'عميل آخر',
    });
    await clientModel.updateOne({ _id: clientId }, { archivedAt: new Date() });
    for (const selected of [
      outside._id.toString(),
      '000000000000000000000000',
      clientId,
    ]) {
      const response = await create({ clientId: selected });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('PROPOSAL_CLIENT_UNAVAILABLE');
    }
    expect(await proposalModel.countDocuments()).toBe(0);
    expect(
      (await clientModel.findById(clientId).orFail()).referenceRevision,
    ).toBe(0);
  });
  it.each([
    'workspaceId',
    'workspace',
    'status',
    'version',
    'totalMinor',
    'itemCount',
    'client',
    'owner',
  ])('rejects proposal mass assignment %s', async (field) => {
    expect(
      (await create({ [field]: field === 'status' ? 'accepted' : 100 })).status,
    ).toBe(422);
    expect(await proposalModel.countDocuments()).toBe(0);
  });
  it('validates prices, quantities, currency, text, item limits and nested computed-field injection', async () => {
    for (const overrides of [
      { title: '' },
      { clientId: 'bad' },
      { currency: 'JPY' },
      { items: [] },
      { items: [{ title: 'Price', quantity: 1, unitPrice: 1 }] },
      { items: [{ title: 'Price', quantity: 1, unitPrice: '1.005' }] },
      { items: [{ title: 'Price', quantity: 1.5, unitPrice: '1' }] },
      { items: [{ title: 'Price', quantity: 2, unitPrice: '1000000000' }] },
      {
        items: [{ title: 'Price', quantity: 1, unitPrice: '1', totalMinor: 1 }],
      },
      { terms: 'x'.repeat(2001) },
    ])
      expect((await create(overrides)).status).toBe(422);
    expect(await proposalModel.countDocuments()).toBe(0);
  });
  it('hides foreign proposal IDs on every read, list and update path', async () => {
    const saved = (await create()).body.data;
    await register.execute({ ...account, email: 'other@example.com' });
    token = (
      await sessions.login.execute({ ...account, email: 'other@example.com' })
    ).accessToken;
    for (const response of [
      await request(app)
        .get('/api/v1/proposals/' + saved.id)
        .set('Authorization', auth()),
      await update(saved.id),
      await request(app)
        .get('/api/v1/proposals/000000000000000000000000')
        .set('Authorization', auth()),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PROPOSAL_NOT_FOUND');
    }
    expect(
      (await request(app).get('/api/v1/proposals').set('Authorization', auth()))
        .body.data.items,
    ).toEqual([]);
    expect(
      (
        await request(app)
          .get('/api/v1/proposals?cursor=' + saved.id)
          .set('Authorization', auth())
      ).body.data.items,
    ).toEqual([]);
    expect((await proposalModel.findById(saved.id).orFail()).version).toBe(1);
  });
  it.each(['sent', 'accepted', 'rejected', 'expired'])(
    'locks %s terms even with a current version',
    async (status) => {
      const saved = (await create()).body.data;
      await proposalModel.updateOne({ _id: saved.id }, { status });
      const response = await update(saved.id, 1, { terms: 'تغيير غير مسموح' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PROPOSAL_LOCKED');
      expect((await proposalModel.findById(saved.id).orFail()).terms).toBe(
        content.terms,
      );
      expect(
        (await clientModel.findById(clientId).orFail()).referenceRevision,
      ).toBe(1);
    },
  );
  it('keeps archived client references readable/editable but prevents selecting a different archived client', async () => {
    const saved = (await create()).body.data;
    await clientModel.updateOne({ _id: clientId }, { archivedAt: new Date() });
    expect((await create()).status).toBe(422);
    expect((await update(saved.id, 1, { terms: 'شروط المسودة' })).status).toBe(
      200,
    );
    const archived = await clientModel.create({
      workspace: workspaceId,
      name: 'مؤرشف آخر',
      archivedAt: new Date(),
    });
    expect(
      (await update(saved.id, 2, { clientId: archived._id.toString() })).status,
    ).toBe(422);
    expect(
      (await proposalModel.findById(saved.id).orFail()).client.id.toString(),
    ).toBe(clientId);
  });
  it('commits one concurrent edit and rolls back the losing reference reservation', async () => {
    const saved = (await create()).body.data;
    const responses = await Promise.all([
      update(saved.id, 1, { title: 'أول تعديل' }),
      update(saved.id, 1, { title: 'ثاني تعديل' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      responses.find((response) => response.status === 409)?.body.error.code,
    ).toBe('PROPOSAL_CONFLICT');
    expect((await proposalModel.findById(saved.id).orFail()).version).toBe(2);
    expect(
      (await clientModel.findById(clientId).orFail()).referenceRevision,
    ).toBe(2);
  });
  it('rolls back a reserved client when creation fails and exposes no database error details', async () => {
    vi.spyOn(proposalModel, 'create').mockRejectedValueOnce(
      new Error('private database diagnostics'),
    );
    const response = await create();
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('private');
    expect(await proposalModel.countDocuments()).toBe(0);
    expect(
      (await clientModel.findById(clientId).orFail()).referenceRevision,
    ).toBe(0);
  });
  it('rolls back client reservation and retains the original proposal when update fails', async () => {
    const saved = (await create()).body.data;
    vi.spyOn(proposalModel, 'findOneAndUpdate').mockRejectedValueOnce(
      new Error('update failed'),
    );
    expect((await update(saved.id)).status).toBe(500);
    expect((await proposalModel.findById(saved.id).orFail()).version).toBe(1);
    expect(
      (await clientModel.findById(clientId).orFail()).referenceRevision,
    ).toBe(1);
  });
  it('serializes client archival with new proposal creation', async () => {
    const [proposal, archive] = await Promise.all([
      create(),
      request(app)
        .post('/api/v1/clients/' + clientId + '/archive')
        .set('Authorization', auth())
        .send({ version: 1 }),
    ]);
    expect(archive.status).toBe(200);
    expect([201, 422]).toContain(proposal.status);
    expect(await proposalModel.countDocuments()).toBe(
      proposal.status === 201 ? 1 : 0,
    );
    expect((await create()).status).toBe(422);
  });
  it('returns bounded summary pages without full terms or deliverables', async () => {
    const saved = (await create()).body.data;
    const source = await proposalModel.findById(saved.id).lean().orFail();
    await proposalModel.insertMany(
      Array.from({ length: 27 }, (_, index) => ({
        workspace: workspaceId,
        client: source.client,
        title: 'عرض ' + index,
        summary: content.summary,
        terms: content.terms,
        items: source.items,
        currency: 'EGP',
        itemCount: 2,
        totalMinor: 50,
      })),
    );
    const first = await request(app)
      .get('/api/v1/proposals')
      .set('Authorization', auth());
    expect(first.body.data.items).toHaveLength(25);
    expect(first.body.data.items[0].items).toBeUndefined();
    expect(first.body.data.items[0].terms).toBeUndefined();
    expect(first.body.data.items[0].summary).toBeUndefined();
    const second = await request(app)
      .get('/api/v1/proposals?cursor=' + first.body.data.nextCursor)
      .set('Authorization', auth());
    expect(second.body.data.items).toHaveLength(3);
    expect(second.body.data.nextCursor).toBeNull();
  });
  it('rejects invalid identifiers, query injection and revoked membership before writes', async () => {
    for (const path of [
      '/api/v1/proposals/bad',
      '/api/v1/proposals?cursor=bad',
      '/api/v1/proposals?workspaceId=' + workspaceId,
      '/api/v1/proposals?status=accepted',
      '/api/v1/proposals?limit=999',
    ])
      expect(
        (await request(app).get(path).set('Authorization', auth())).status,
      ).toBe(422);
    const anonymous = await request(app)
      .post('/api/v1/proposals')
      .send({ ...content, clientId });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    await models.Membership.deleteMany({});
    expect((await create()).status).toBe(401);
    expect(await proposalModel.countDocuments()).toBe(0);
    expect(
      (await clientModel.findById(clientId).orFail()).referenceRevision,
    ).toBe(0);
  });
  const issue = (id: string, version = 1, days = 7) =>
    request(app)
      .post('/api/v1/proposals/' + id + '/share')
      .set('Authorization', auth())
      .send({ version, days });
  const revoke = (id: string, version: number) =>
    request(app)
      .post('/api/v1/proposals/' + id + '/share/revoke')
      .set('Authorization', auth())
      .send({ version });
  const publicRead = (secret: string) =>
    request(app).post('/api/v1/public/proposals/read').send({ token: secret });
  it('shares and locks the exact reviewed version in one write, stores only a digest, and returns an allowlisted public document', async () => {
    const draft = (await create()).body.data;
    const result = await issue(draft.id);
    expect(result.status).toBe(201);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toMatchObject({
      proposalVersion: 2,
      proposalStatus: 'sent',
      share: { state: 'active', revokedAt: null },
    });
    expect(result.body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const saved = await proposalModel.findById(draft.id).orFail();
    expect(saved.share?.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(saved.share?.digest).not.toBe(result.body.data.token);
    expect(JSON.stringify(saved)).not.toContain(result.body.data.token);
    expect(saved.share?.expiresAt.getTime()).toBe(
      shareNow.getTime() + 7 * 86_400_000,
    );
    const read = await publicRead(result.body.data.token);
    expect(read.status).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(read.headers['referrer-policy']).toBe('no-referrer');
    expect(read.headers['x-robots-tag']).toContain('noindex');
    expect(read.body.data).toMatchObject({
      title: content.title,
      summary: content.summary,
      terms: content.terms,
      totalMinor: 50,
      status: 'sent',
      client: { name: 'سارة علي', company: 'استوديو سارة' },
      validForSeconds: 7 * 86_400,
    });
    expect(Object.keys(read.body.data).sort()).toEqual(
      [
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
        'canRespond',
        'decision',
      ].sort(),
    );
    expect(Object.keys(read.body.data.client).sort()).toEqual([
      'company',
      'name',
    ]);
    expect(read.body.data.items).toEqual(draft.items);
    expect(JSON.stringify(read.body)).not.toContain('sara@example.com');
    expect(JSON.stringify(read.body)).not.toContain(workspaceId);
    expect(JSON.stringify(read.body)).not.toContain(clientId);
    expect(JSON.stringify(read.body)).not.toContain(saved.share?.digest);
    expect((await update(draft.id, 2)).status).toBe(409);
    const owner = await request(app)
      .get('/api/v1/proposals/' + draft.id)
      .set('Authorization', auth());
    expect(owner.body.data.share).toBeUndefined();
    const state = await request(app)
      .get('/api/v1/proposals/' + draft.id + '/share')
      .set('Authorization', auth());
    expect(state.body.data.token).toBeUndefined();
    expect(state.body.data.share.digest).toBeUndefined();
  });
  it('renews with a fresh credential, immediately invalidates the old one, and revokes without unlocking content', async () => {
    const draft = (await create()).body.data;
    const first = (await issue(draft.id)).body.data;
    const second = (await issue(draft.id, 2, 1)).body.data;
    expect(second.token).not.toBe(first.token);
    expect(second.proposalVersion).toBe(3);
    expect((await publicRead(first.token)).status).toBe(404);
    expect((await publicRead(second.token)).status).toBe(200);
    const closed = await revoke(draft.id, 3);
    expect(closed.body.data).toMatchObject({
      proposalVersion: 4,
      proposalStatus: 'sent',
      share: { state: 'revoked' },
    });
    expect((await publicRead(second.token)).status).toBe(404);
    expect(
      (await proposalModel.findById(draft.id).orFail()).share?.digest,
    ).toBeNull();
    const again = await revoke(draft.id, 4);
    expect(again.status).toBe(200);
    expect(again.body.data.proposalVersion).toBe(4);
    expect((await update(draft.id, 4)).status).toBe(409);
    const reopened = await issue(draft.id, 4);
    expect(reopened.status).toBe(201);
    expect((await publicRead(reopened.body.data.token)).status).toBe(200);
  });
  it('expires exactly at the deadline without relying on TTL deletion, with the same public failure as revoked or unknown credentials', async () => {
    const draft = (await create()).body.data;
    const result = (await issue(draft.id, 1, 1)).body.data;
    shareNow = new Date(shareNow.getTime() + 86_400_000 - 1);
    expect((await publicRead(result.token)).status).toBe(200);
    shareNow = new Date(shareNow.getTime() + 1);
    const expired = await publicRead(result.token);
    expect(expired.status).toBe(404);
    expect(expired.body).toEqual((await publicRead('x'.repeat(43))).body);
    const state = await request(app)
      .get('/api/v1/proposals/' + draft.id + '/share')
      .set('Authorization', auth());
    expect(state.body.data.share.state).toBe('expired');
    expect(await proposalModel.countDocuments()).toBe(1);
    await revoke(draft.id, 2);
    expect((await publicRead(result.token)).body).toEqual(expired.body);
  });
  it('enforces live membership and workspace isolation on read, issue and revoke while anonymous access requires only its specific grant', async () => {
    const draft = (await create()).body.data;
    const result = (await issue(draft.id)).body.data;
    await register.execute({ ...account, email: 'other-sharing@example.com' });
    const other = await sessions.login.execute({
      ...account,
      email: 'other-sharing@example.com',
    });
    const otherAuth = 'Bearer ' + other.accessToken;
    expect(
      (
        await request(app)
          .get('/api/v1/proposals/' + draft.id + '/share')
          .set('Authorization', otherAuth)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/v1/proposals/' + draft.id + '/share')
          .set('Authorization', otherAuth)
          .send({ version: 2, days: 7 })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/v1/proposals/' + draft.id + '/share/revoke')
          .set('Authorization', otherAuth)
          .send({ version: 2 })
      ).status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/v1/proposals/' + draft.id + '/share'))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/proposals/' + draft.id + '/share')
          .send({ version: 2, days: 7 })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/proposals/' + draft.id + '/share/revoke')
          .send({ version: 2 })
      ).status,
    ).toBe(401);
    await models.Membership.deleteMany({ workspace: workspaceId });
    expect((await revoke(draft.id, 2)).status).toBe(401);
    expect((await publicRead(result.token)).status).toBe(200);
  });
  it.each([0, 31, 1.5, -1])(
    'rejects lifetime %s without locking or creating a grant',
    async (days) => {
      const draft = (await create()).body.data;
      expect((await issue(draft.id, 1, days)).status).toBe(422);
      const saved = await proposalModel.findById(draft.id).orFail();
      expect(saved.status).toBe('draft');
      expect(saved.version).toBe(1);
      expect(saved.share).toBeNull();
    },
  );
  it('rejects stale/invalid versions, missing proposals, forged sharing fields and tokens passed in URLs', async () => {
    const draft = (await create()).body.data;
    expect((await issue(draft.id, 2)).status).toBe(409);
    expect((await issue(draft.id, 0)).status).toBe(422);
    expect((await issue('abcdef123456abcdef123456')).status).toBe(404);
    expect((await revoke(draft.id, 1)).status).toBe(404);
    for (const fields of [
      { workspaceId },
      { token: 'x'.repeat(43) },
      { digest: 'a'.repeat(64) },
      { senderName: 'forged' },
      { days: '7' },
    ]) {
      expect(
        (
          await request(app)
            .post('/api/v1/proposals/' + draft.id + '/share')
            .set('Authorization', auth())
            .send({ version: 1, days: 7, ...fields })
        ).status,
      ).toBe(422);
    }
    expect(
      (
        await request(app)
          .post('/api/v1/public/proposals/read')
          .query({ token: 'x'.repeat(43) })
          .send({})
      ).status,
    ).toBe(404);
    for (const body of [
      {},
      { token: 123 },
      { token: 'x'.repeat(44) },
      { token: 'x'.repeat(43), workspaceId },
      { token: clientId },
      { token: '../' + clientId },
    ]) {
      const result = await request(app)
        .post('/api/v1/public/proposals/read')
        .send(body);
      expect(result.status).toBe(404);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.body.data).toBeUndefined();
    }
    expect((await proposalModel.findById(draft.id).orFail()).version).toBe(1);
  });
  it.each(['accepted', 'rejected', 'expired'])(
    'does not issue a new grant for a %s proposal',
    async (status) => {
      const draft = (await create()).body.data;
      await proposalModel.updateOne({ _id: draft.id }, { $set: { status } });
      expect((await issue(draft.id)).status).toBe(409);
      expect(
        (await proposalModel.findById(draft.id).orFail()).share,
      ).toBeNull();
    },
  );
  it('only one concurrent issuance succeeds and independent documents can hold separate unique grants', async () => {
    const draft = (await create()).body.data;
    const results = await Promise.all([issue(draft.id), issue(draft.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const success = results.find((r) => r.status === 201);
    expect((await publicRead(success?.body.data.token)).status).toBe(200);
    expect((await proposalModel.findById(draft.id).orFail()).version).toBe(2);
    const other = (await create()).body.data;
    const another = await issue(other.id);
    expect(another.status).toBe(201);
    expect(another.body.data.token).not.toBe(success?.body.data.token);
    expect((await publicRead(another.body.data.token)).status).toBe(200);
  });
  it('serializes issuance with draft edits and never exposes an unreviewed concurrent revision', async () => {
    const draft = (await create()).body.data;
    const [shared, edited] = await Promise.all([
      issue(draft.id),
      update(draft.id, 1, { title: 'عنوان محدث' }),
    ]);
    const saved = await proposalModel.findById(draft.id).orFail();
    expect(saved.version).toBe(2);
    if (shared.status === 201) {
      expect(edited.status).toBe(409);
      expect((await publicRead(shared.body.data.token)).body.data.title).toBe(
        content.title,
      );
      expect(saved.status).toBe('sent');
    } else {
      expect(shared.status).toBe(409);
      expect(edited.status).toBe(200);
      expect(saved.title).toBe('عنوان محدث');
      expect(saved.share).toBeNull();
    }
  });
  it('serializes renewal with revocation using the same version', async () => {
    const draft = (await create()).body.data;
    const first = (await issue(draft.id)).body.data;
    const [renewed, closed] = await Promise.all([
      issue(draft.id, 2),
      revoke(draft.id, 2),
    ]);
    expect(
      [renewed.status === 201, closed.status === 200].filter(Boolean),
    ).toHaveLength(1);
    expect([renewed.status, closed.status]).toContain(409);
    expect((await proposalModel.findById(draft.id).orFail()).version).toBe(3);
    expect((await publicRead(first.token)).status).toBe(404);
    if (renewed.status === 201)
      expect((await publicRead(renewed.body.data.token)).status).toBe(200);
    else
      expect(
        (await proposalModel.findById(draft.id).orFail()).share?.revokedAt,
      ).not.toBeNull();
  });
  it('does not expose a draft or expired terminal proposal even if a digest remains in storage', async () => {
    const draft = (await create()).body.data;
    const result = (await issue(draft.id)).body.data;
    for (const status of ['draft', 'expired']) {
      await proposalModel.updateOne({ _id: draft.id }, { $set: { status } });
      expect((await publicRead(result.token)).status).toBe(404);
    }
  });
  it('limits anonymous reads and returns a safe retry response', async () => {
    for (let attempt = 0; attempt < 60; attempt++)
      expect((await publicRead('x'.repeat(43))).status).toBe(404);
    const limited = await publicRead('x'.repeat(43));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['retry-after']).toBeDefined();
  });
  it('a failed grant write leaves the draft editable and exposes no internal error or credential', async () => {
    const draft = (await create()).body.data;
    vi.spyOn(proposalModel, 'findOneAndUpdate').mockImplementationOnce(() => {
      throw new Error('private persistence failure');
    });
    const failed = await issue(draft.id);
    expect(failed.status).toBe(500);
    expect(failed.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(failed.body)).not.toContain('private persistence');
    const saved = await proposalModel.findById(draft.id).orFail();
    expect(saved.version).toBe(1);
    expect(saved.status).toBe('draft');
    expect(saved.share).toBeNull();
  });
  const decide = (
    secret: string,
    decision = 'accept',
    requestId: string = randomUUID(),
  ) =>
    request(app)
      .post('/api/v1/public/proposals/decide')
      .set('Origin', origin)
      .send({ token: secret, decision, requestId });
  async function sharedProposal() {
    const draft = (await create()).body.data;
    const grant = (await issue(draft.id)).body.data;
    return { draft, grant };
  }
  it('accepts once, creates the exact frozen agreement and exposes only safe decision metadata', async () => {
    const { draft, grant } = await sharedProposal();
    const result = await decide(grant.token);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({
      status: 'accepted',
      decidedAt: shareNow.toISOString(),
    });
    const saved = await proposalModel.findById(draft.id).orFail();
    expect(saved.status).toBe('accepted');
    expect(saved.version).toBe(3);
    const project = await projectModel
      .findById(saved.decision?.project)
      .orFail();
    expect(await projectModel.countDocuments()).toBe(1);
    expect(project.sourceProposal?.toString()).toBe(draft.id);
    expect(project.workspace.toString()).toBe(workspaceId);
    expect(project.status).toBe('active');
    expect(project.acceptedAt).toEqual(shareNow);
    expect(project.totalMinor).toBe(50);
    expect(project.client.email).toBe(draft.client.email);
    const owner = await request(app)
      .get('/api/v1/proposals/' + draft.id)
      .set('Authorization', auth());
    expect(owner.body.data).toMatchObject({
      projectId: project.id,
      decision: { outcome: 'accepted', at: shareNow.toISOString() },
    });
    const readProject = await request(app)
      .get('/api/v1/projects/' + project.id)
      .set('Authorization', auth());
    expect(readProject.status).toBe(200);
    expect(readProject.headers['cache-control']).toBe('no-store');
    expect(readProject.body.data).toMatchObject({
      title: draft.title,
      summary: draft.summary,
      terms: draft.terms,
      items: draft.items,
      client: draft.client,
      totalMinor: draft.totalMinor,
    });
    expect(readProject.body.data.workspace).toBeUndefined();
    expect(readProject.body.data._id).toBeUndefined();
    const publicResult = await publicRead(grant.token);
    expect(publicResult.body.data).toMatchObject({
      status: 'accepted',
      canRespond: false,
      decision: { outcome: 'accepted', at: shareNow.toISOString() },
    });
    for (const privateValue of [
      project.id,
      workspaceId,
      draft.id,
      saved.decision?.requestId,
      saved.share?.digest,
    ])
      expect(JSON.stringify(publicResult.body)).not.toContain(privateValue);
    expect(JSON.stringify(owner.body)).not.toContain(saved.decision?.requestId);
    expect((await issue(draft.id, 3)).status).toBe(409);
    expect((await update(draft.id, 3)).status).toBe(409);
    expect((await revoke(draft.id, 3)).status).toBe(200);
    expect((await publicRead(grant.token)).status).toBe(404);
    expect(await projectModel.countDocuments()).toBe(1);
  });
  it('rejects without a project and replays the same final result only for the same attempt', async () => {
    const { draft, grant } = await sharedProposal();
    const key = randomUUID();
    const result = await decide(grant.token, 'reject', key);
    expect(result.status).toBe(200);
    shareNow = new Date(shareNow.getTime() + 1000);
    expect(
      (await decide(grant.token, 'reject', key.toUpperCase())).body,
    ).toEqual(result.body);
    expect((await decide(grant.token, 'accept', key)).status).toBe(409);
    expect((await decide(grant.token, 'reject')).status).toBe(409);
    expect(await projectModel.countDocuments()).toBe(0);
    const saved = await proposalModel.findById(draft.id).orFail();
    expect(saved.status).toBe('rejected');
    expect(saved.version).toBe(3);
    expect(saved.decision?.project).toBeNull();
    expect((await publicRead(grant.token)).body.data.canRespond).toBe(false);
  });
  it('serializes duplicate concurrent acceptance into the same result and one project', async () => {
    const { draft, grant } = await sharedProposal();
    const key = randomUUID();
    const results = await Promise.all([
      decide(grant.token, 'accept', key),
      decide(grant.token, 'accept', key),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    expect(await projectModel.countDocuments()).toBe(1);
    expect((await proposalModel.findById(draft.id).orFail()).version).toBe(3);
  });
  it.each([
    ['accept', 'accept'],
    ['accept', 'reject'],
    ['reject', 'reject'],
  ])(
    'serializes independent concurrent %s/%s decisions into one final state',
    async (a, b) => {
      const { draft, grant } = await sharedProposal();
      const results = await Promise.all([
        decide(grant.token, a),
        decide(grant.token, b),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = results.find((r) => r.status === 200);
      const saved = await proposalModel.findById(draft.id).orFail();
      expect(saved.status).toBe(winner?.body.data.status);
      expect(saved.version).toBe(3);
      expect(await projectModel.countDocuments()).toBe(
        saved.status === 'accepted' ? 1 : 0,
      );
    },
  );
  it.each(['accept', 'reject'])(
    'keeps legacy links read-only until explicitly renewed (%s)',
    async (choice) => {
      const { draft, grant } = await sharedProposal();
      await proposalModel.updateOne(
        { _id: draft.id },
        { $unset: { 'share.allowResponse': '' } },
      );
      expect((await publicRead(grant.token)).body.data.canRespond).toBe(false);
      expect((await decide(grant.token, choice)).status).toBe(404);
      const renewed = (await issue(draft.id, 2)).body.data;
      expect((await decide(grant.token)).status).toBe(404);
      expect((await publicRead(renewed.token)).body.data.canRespond).toBe(true);
      expect((await decide(renewed.token, choice)).status).toBe(200);
    },
  );
  it.each(['expired', 'revoked', 'renewed', 'draft', 'terminal-expired'])(
    'rejects unavailable decision grants: %s',
    async (state) => {
      const { draft, grant } = await sharedProposal();
      if (state === 'expired') shareNow = new Date(grant.share.expiresAt);
      if (state === 'revoked') await revoke(draft.id, 2);
      if (state === 'renewed') await issue(draft.id, 2);
      if (state === 'draft' || state === 'terminal-expired')
        await proposalModel.updateOne(
          { _id: draft.id },
          { status: state === 'draft' ? 'draft' : 'expired' },
        );
      const response = await decide(grant.token);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PROPOSAL_SHARE_UNAVAILABLE');
      expect(await projectModel.countDocuments()).toBe(0);
    },
  );
  it('cannot replay an accepted attempt after the grant expires', async () => {
    const { grant } = await sharedProposal();
    const key = randomUUID();
    expect((await decide(grant.token, 'accept', key)).status).toBe(200);
    shareNow = new Date(grant.share.expiresAt);
    expect((await decide(grant.token, 'accept', key)).status).toBe(404);
    expect(await projectModel.countDocuments()).toBe(1);
  });
  it.each(['revoke', 'renew'])(
    'serializes acceptance against concurrent %s',
    async (action) => {
      const { draft, grant } = await sharedProposal();
      const [result, owner] = await Promise.all([
        decide(grant.token),
        action === 'revoke' ? revoke(draft.id, 2) : issue(draft.id, 2),
      ]);
      const saved = await proposalModel.findById(draft.id).orFail();
      if (result.status === 200) {
        expect(owner.status).toBe(409);
        expect(saved.status).toBe('accepted');
        expect(await projectModel.countDocuments()).toBe(1);
      } else {
        expect(result.status).toBe(404);
        expect(owner.status).toBe(action === 'revoke' ? 200 : 201);
        expect(saved.status).toBe('sent');
        expect(await projectModel.countDocuments()).toBe(0);
      }
      expect(saved.version).toBe(3);
    },
  );
  it('accepts the frozen client snapshot even after the client is changed and archived', async () => {
    const { draft, grant } = await sharedProposal();
    await clientModel.updateOne(
      { _id: clientId },
      { name: 'Changed', email: 'other@example.com', archivedAt: new Date() },
    );
    expect((await decide(grant.token)).status).toBe(200);
    const project = await projectModel.findOne().orFail();
    expect(project.client.name).toBe(draft.client.name);
    expect(project.client.email).toBe(draft.client.email);
  });
  it.each(['create', 'link'])(
    'rolls back the decision and project together after a failed %s step',
    async (step) => {
      const { draft, grant } = await sharedProposal();
      const key = randomUUID();
      if (step === 'create')
        vi.spyOn(projectModel, 'create').mockImplementationOnce(() => {
          throw new Error('private project persistence failure');
        });
      else
        vi.spyOn(
          MongoProposalDecisionStore.prototype,
          'linkProject',
        ).mockResolvedValueOnce(false);
      const result = await decide(grant.token, 'accept', key);
      expect(result.status).toBe(500);
      expect(result.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(result.body)).not.toContain('persistence');
      const saved = await proposalModel.findById(draft.id).orFail();
      expect(saved.status).toBe('sent');
      expect(saved.version).toBe(2);
      expect(saved.decision).toBeNull();
      expect(await projectModel.countDocuments()).toBe(0);
      expect((await decide(grant.token, 'accept', key)).status).toBe(200);
      expect(await projectModel.countDocuments()).toBe(1);
    },
  );
  it('scopes accepted projects to current live membership, rejects anonymous reads and enforces source uniqueness', async () => {
    const { draft, grant } = await sharedProposal();
    await decide(grant.token);
    const project = await projectModel.findOne().orFail();
    const url = '/api/v1/projects/' + project.id;
    expect((await request(app).get(url)).status).toBe(401);
    const otherAccount = { ...account, email: 'another@example.com' };
    await register.execute(otherAccount);
    const other = await sessions.login.execute(otherAccount);
    expect(
      (
        await request(app)
          .get(url)
          .set('Authorization', 'Bearer ' + other.accessToken)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get('/api/v1/projects/not-an-id')
          .set('Authorization', auth())
      ).status,
    ).toBe(422);
    const duplicate = project.toObject();
    Reflect.deleteProperty(duplicate, '_id');
    await expect(projectModel.create(duplicate)).rejects.toMatchObject({
      code: 11000,
    });
    expect(await projectModel.countDocuments()).toBe(1);
    await models.Membership.deleteMany({ workspace: workspaceId });
    expect(
      (await request(app).get(url).set('Authorization', auth())).status,
    ).toBe(401);
    expect((await publicRead(grant.token)).status).toBe(200);
    expect(project.sourceProposal?.toString()).toBe(draft.id);
  });
  it('requires the exact web origin and strict validated decision payloads', async () => {
    const { grant } = await sharedProposal();
    const body = {
      token: grant.token,
      decision: 'accept',
      requestId: randomUUID(),
    };
    for (const untrusted of ['', 'https://untrusted.example', origin + '/']) {
      const result = await request(app)
        .post('/api/v1/public/proposals/decide')
        .set('Origin', untrusted)
        .send(body);
      expect(result.status).toBe(403);
    }
    for (const patch of [
      { requestId: 'arbitrary' },
      { requestId: '00000000-0000-1000-8000-000000000000' },
      { decision: 'maybe' },
      { workspaceId },
      { projectId: clientId },
    ]) {
      const result = await request(app)
        .post('/api/v1/public/proposals/decide')
        .set('Origin', origin)
        .send({ ...body, ...patch });
      expect(result.status).toBe(422);
    }
    expect((await decide('bad')).status).toBe(404);
    expect(await projectModel.countDocuments()).toBe(0);
  });
  it('limits public decisions independently from document reads', async () => {
    for (let attempt = 0; attempt < 20; attempt++)
      expect((await decide('x'.repeat(43))).status).toBe(404);
    const limited = await decide('x'.repeat(43));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.headers['cache-control']).toBe('no-store');
    expect((await publicRead('x'.repeat(43))).status).toBe(404);
  });

  function manualProject(overrides: Record<string, unknown> = {}) {
    return request(app)
      .post('/api/v1/projects')
      .set('Authorization', auth())
      .send({
        clientId,
        title: '  مشروع يدوي  ',
        summary: '  وصف الشغل  ',
        ...overrides,
      });
  }
  function statusProject(id: string, version: number, status: string) {
    return request(app)
      .post('/api/v1/projects/' + id + '/status')
      .set('Authorization', auth())
      .send({ version, status });
  }
  it('creates multiple manual projects with private client snapshots and no invented agreement', async () => {
    const first = await manualProject();
    const second = await manualProject({ title: 'شغل تاني' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data).toMatchObject({
      origin: 'manual',
      sourceProposalId: null,
      title: 'مشروع يدوي',
      summary: 'وصف الشغل',
      currency: null,
      totalMinor: null,
      acceptedAt: null,
      terms: '',
      items: [],
      status: 'active',
      version: 1,
      client: { id: clientId, name: 'سارة علي' },
    });
    expect(first.body.data).not.toHaveProperty('workspace');
    expect(first.body.data.client).not.toHaveProperty('notes');
    expect(await projectModel.countDocuments()).toBe(2);
    expect(
      (await clientModel.findById(clientId).orFail()).referenceRevision,
    ).toBe(2);
    await clientModel.updateOne(
      { _id: clientId },
      {
        $set: {
          name: 'اسم جديد',
          email: 'new@example.com',
          archivedAt: new Date(),
        },
      },
    );
    const read = await request(app)
      .get('/api/v1/projects/' + first.body.data.id)
      .set('Authorization', auth());
    expect(read.body.data.client.name).toBe('سارة علي');
    expect(read.body.data.client.email).toBe('sara@example.com');
    expect(read.headers['cache-control']).toBe('no-store');
  });
  it.each([
    { workspaceId: '0123456789abcdef01234567' },
    { sourceProposalId: '0123456789abcdef01234567' },
    { status: 'completed' },
    { version: 7 },
    { currency: 'USD' },
    { title: 'x' },
    { summary: 'x'.repeat(3001) },
    { clientId: 'invalid' },
  ])('strictly rejects project create fields %j', async (patch) => {
    expect((await manualProject(patch)).status).toBe(422);
    expect(await projectModel.countDocuments()).toBe(0);
  });
  it('rejects archived and foreign clients without leaking their details', async () => {
    await clientModel.updateOne(
      { _id: clientId },
      { $set: { archivedAt: new Date() } },
    );
    expect((await manualProject()).body.error.code).toBe(
      'PROJECT_CLIENT_UNAVAILABLE',
    );
    await register.execute({ ...account, email: 'other-project@example.com' });
    const other = await sessions.login.execute({
      ...account,
      email: 'other-project@example.com',
    });
    const foreign = await clientModel.create({
      workspace: other.identity.workspace.id,
      name: 'Foreign client',
    });
    expect(
      (await manualProject({ clientId: foreign.id })).body.error.code,
    ).toBe('PROJECT_CLIENT_UNAVAILABLE');
    expect(await projectModel.countDocuments()).toBe(0);
  });
  it('rolls back the client reservation if manual project storage fails', async () => {
    const before = (await clientModel.findById(clientId).orFail())
      .referenceRevision;
    vi.spyOn(MongoProjectStore.prototype, 'createManual').mockRejectedValueOnce(
      new Error('Storage unavailable'),
    );
    const result = await manualProject();
    expect(result.status).toBe(500);
    expect(result.body.error.message).not.toContain('Storage');
    expect(await projectModel.countDocuments()).toBe(0);
    expect(
      (await clientModel.findById(clientId).orFail()).referenceRevision,
    ).toBe(before);
  });
  it('serializes manual creation with concurrent client archive', async () => {
    const [created, archived] = await Promise.all([
      manualProject(),
      request(app)
        .post('/api/v1/clients/' + clientId + '/archive')
        .set('Authorization', auth())
        .send({ version: 1 }),
    ]);
    expect(archived.status).toBe(200);
    expect([201, 422]).toContain(created.status);
    expect(await projectModel.countDocuments()).toBe(
      created.status === 201 ? 1 : 0,
    );
    if (created.status === 201)
      expect(created.body.data.client.name).toBe('سارة علي');
  });
  it('lists bounded project pages and resets cursors with explicit status filters', async () => {
    const projects = createProjects(database, projectModel, clientModel);
    for (let index = 0; index < 27; index++)
      await projects.create(workspaceId, {
        clientId,
        title: 'مشروع ' + index,
        summary: '',
      });
    const first = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', auth());
    expect(first.body.data.items).toHaveLength(25);
    expect(first.body.data.nextCursor).toBeTruthy();
    const last = await request(app)
      .get('/api/v1/projects?cursor=' + first.body.data.nextCursor)
      .set('Authorization', auth());
    expect(last.body.data.items).toHaveLength(2);
    expect(last.body.data.nextCursor).toBeNull();
    const ids = [...first.body.data.items, ...last.body.data.items].map(
      (project: { id: string }) => project.id,
    );
    expect(new Set(ids).size).toBe(27);
    const id = first.body.data.items[0].id;
    expect((await statusProject(id, 1, 'on_hold')).status).toBe(200);
    const filtered = await request(app)
      .get('/api/v1/projects?status=on_hold')
      .set('Authorization', auth());
    expect(
      filtered.body.data.items.map((project: { id: string }) => project.id),
    ).toEqual([id]);
    expect(filtered.body.data.items[0]).not.toHaveProperty('items');
    expect(filtered.body.data.items[0]).not.toHaveProperty('workspace');
    for (const query of [
      'status=unknown',
      'cursor=bad',
      'limit=1000',
      'workspaceId=' + workspaceId,
      'status=active&status=cancelled',
    ])
      expect(
        (
          await request(app)
            .get('/api/v1/projects?' + query)
            .set('Authorization', auth())
        ).status,
      ).toBe(422);
  });
  it('enforces final statuses, resumes paused work and never rewrites project content', async () => {
    const original = (await manualProject()).body.data;
    const id = original.id;
    expect((await statusProject(id, 1, 'on_hold')).body.data.version).toBe(2);
    expect((await statusProject(id, 2, 'completed')).body.error.code).toBe(
      'PROJECT_STATUS_INVALID',
    );
    expect((await statusProject(id, 2, 'active')).body.data.version).toBe(3);
    const final = await statusProject(id, 3, 'completed');
    expect(final.body.data).toMatchObject({
      ...original,
      status: 'completed',
      version: 4,
      updatedAt: expect.any(String),
    });
    expect((await statusProject(id, 4, 'active')).body.error.code).toBe(
      'PROJECT_STATUS_INVALID',
    );
    const cancelled = (await manualProject()).body.data;
    expect((await statusProject(cancelled.id, 1, 'cancelled')).status).toBe(
      200,
    );
    expect((await statusProject(cancelled.id, 2, 'active')).status).toBe(409);
    expect(
      (
        await request(app)
          .post('/api/v1/projects/' + id + '/status')
          .set('Authorization', auth())
          .send({ version: 4, status: 'active', title: 'rewrite' })
      ).status,
    ).toBe(422);
  });
  it('allows only one concurrent status update and rejects a stale replay', async () => {
    const project = (await manualProject()).body.data;
    const results = await Promise.all([
      statusProject(project.id, 1, 'on_hold'),
      statusProject(project.id, 1, 'cancelled'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((await projectModel.findById(project.id).orFail()).version).toBe(2);
    expect(
      (await statusProject(project.id, 1, 'completed')).body.error.code,
    ).toBe('PROJECT_CONFLICT');
  });
  it('hides foreign projects and requires current live membership for list/create/status', async () => {
    const project = (await manualProject()).body.data;
    await register.execute({ ...account, email: 'project-reader@example.com' });
    const other = await sessions.login.execute({
      ...account,
      email: 'project-reader@example.com',
    });
    expect(
      (
        await request(app)
          .get('/api/v1/projects')
          .set('Authorization', 'Bearer ' + other.accessToken)
      ).body.data.items,
    ).toEqual([]);
    expect(
      (
        await request(app)
          .post('/api/v1/projects/' + project.id + '/status')
          .set('Authorization', 'Bearer ' + other.accessToken)
          .send({ version: 1, status: 'cancelled' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get('/api/v1/projects/' + project.id)
          .set('Authorization', 'Bearer ' + other.accessToken)
      ).status,
    ).toBe(404);
    expect((await request(app).get('/api/v1/projects')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/projects')
          .send({ clientId, title: 'manual' })
      ).status,
    ).toBe(401);
    await models.Membership.deleteOne({ workspace: workspaceId });
    expect((await statusProject(project.id, 1, 'cancelled')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/projects').set('Authorization', auth()))
        .status,
    ).toBe(401);
  });
  it('updates legacy accepted projects without version fields and preserves their agreement', async () => {
    const proposal = await create();
    const grant = await issue(proposal.body.data.id, 1);
    await decide(grant.body.data.token);
    const stored = await projectModel.findOne().orFail();
    await projectModel.collection.updateOne(
      { _id: stored._id },
      { $unset: { version: '' } },
    );
    const read = await request(app)
      .get('/api/v1/projects/' + stored.id)
      .set('Authorization', auth());
    expect(read.body.data.version).toBe(1);
    const updated = await statusProject(stored.id, 1, 'completed');
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);
    expect(updated.body.data.items).toEqual(read.body.data.items);
    expect(updated.body.data.client).toEqual(read.body.data.client);
    expect(updated.body.data.acceptedAt).toBe(read.body.data.acceptedAt);
    expect(
      (await proposalModel.findById(proposal.body.data.id).orFail()).status,
    ).toBe('accepted');
  });
  it('migrates the legacy source index before admitting multiple manual projects', async () => {
    await projectModel.collection.createIndex(
      { workspace: 1, sourceProposal: 1 },
      { unique: true, name: 'workspace_1_sourceProposal_1' },
    );
    try {
      await Promise.all([
        initializeProjectModel(projectModel),
        initializeProjectModel(projectModel),
      ]);
      expect(
        (await projectModel.collection.indexes()).some(
          (index) => index.name === 'workspace_1_sourceProposal_1',
        ),
      ).toBe(false);
      expect((await manualProject()).status).toBe(201);
      expect((await manualProject()).status).toBe(201);
      const source = '0123456789abcdef01234567';
      const input = {
        workspace: workspaceId,
        sourceProposal: source,
        title: 'Snapshot',
        client: { id: clientId, name: 'Client' },
        currency: 'EGP' as const,
        totalMinor: 0,
        items: [],
        acceptedAt: new Date(),
      };
      await projectModel.create(input);
      await expect(projectModel.create(input)).rejects.toMatchObject({
        code: 11000,
      });
    } finally {
      const indexes = await projectModel.collection.indexes();
      if (
        indexes.some((index) => index.name === 'workspace_1_sourceProposal_1')
      )
        await projectModel.collection.dropIndex('workspace_1_sourceProposal_1');
    }
  });
});
