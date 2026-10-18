import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { ManageClients } from '../src/modules/clients/application/manage-clients.js';
import { createClientModel } from '../src/modules/clients/infrastructure/client-model.js';
import { MongoClientStore } from '../src/modules/clients/infrastructure/mongo-client-store.js';
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
describe('Workspace-scoped client HTTP and Mongo operations', () => {
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
    database = await connectDatabase(replica.getUri('clients-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    clientModel = createClientModel(database);
    await clientModel.createCollection();
    await clientModel.createIndexes();
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
    await clientModel.deleteMany({});
    await consumed.deleteMany({});
    await sessionModel.deleteMany({});
    await models.Membership.deleteMany({});
    await models.Workspace.deleteMany({});
    await models.User.deleteMany({});
    app = createApp(origin, {
      sessions,
      clients: new ManageClients(new MongoClientStore(clientModel)),
    });
    await register.execute(account);
    const login = await sessions.login.execute(account);
    token = login.accessToken;
    workspaceId = login.identity.workspace.id;
  });
  afterAll(async () => {
    await database?.close();
    await replica?.stop();
  });
  const auth = () => `Bearer ${token}`;
  async function create() {
    return request(app)
      .post('/api/v1/clients')
      .set('Authorization', auth())
      .send(details);
  }
  it('creates normalized data, returns a safe DTO, reads and updates with a version', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body.data).toMatchObject({
      name: 'سارة علي',
      email: 'sara@example.com',
      version: 1,
      archivedAt: null,
    });
    expect(created.body.data.workspace).toBeUndefined();
    expect(created.body.data._id).toBeUndefined();
    const id = created.body.data.id;
    expect(
      (
        await request(app)
          .get(`/api/v1/clients/${id}`)
          .set('Authorization', auth())
      ).body.data.notes,
    ).toBe(details.notes);
    const edited = await request(app)
      .put(`/api/v1/clients/${id}`)
      .set('Authorization', auth())
      .send({ name: 'سارة الجديدة', version: 1 });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      name: 'سارة الجديدة',
      email: '',
      phone: '',
      company: '',
      notes: '',
      version: 2,
    });
    expect(
      (await request(app).get('/api/v1/clients').set('Authorization', auth()))
        .body.data.items,
    ).toHaveLength(1);
  });
  it('hides foreign clients consistently across read, update, archive, list and cursor', async () => {
    const original = (await create()).body.data;
    await register.execute({ ...account, email: 'other@example.com' });
    token = (
      await sessions.login.execute({ ...account, email: 'other@example.com' })
    ).accessToken;
    expect(
      (await request(app).get('/api/v1/clients').set('Authorization', auth()))
        .body.data.items,
    ).toEqual([]);
    expect(
      (
        await request(app)
          .get('/api/v1/clients?cursor=' + original.id)
          .set('Authorization', auth())
      ).body.data.items,
    ).toEqual([]);
    for (const response of [
      await request(app)
        .get('/api/v1/clients/' + original.id)
        .set('Authorization', auth()),
      await request(app)
        .put('/api/v1/clients/' + original.id)
        .set('Authorization', auth())
        .send({ name: 'Hijacked', version: 1 }),
      await request(app)
        .post('/api/v1/clients/' + original.id + '/archive')
        .set('Authorization', auth())
        .send({ version: 1 }),
      await request(app)
        .get('/api/v1/clients/000000000000000000000000')
        .set('Authorization', auth()),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CLIENT_NOT_FOUND');
    }
    const stored = await clientModel.findById(original.id).orFail();
    expect(stored.name).toBe('سارة علي');
    expect(stored.version).toBe(1);
    expect(stored.archivedAt).toBeNull();
  });
  it.each([
    'workspaceId',
    'workspace',
    'userId',
    'role',
    'archivedAt',
    'version',
  ])('rejects create field injection %s', async (field) => {
    const response = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', auth())
      .send({ ...details, [field]: workspaceId });
    expect(response.status).toBe(422);
    expect(await clientModel.countDocuments()).toBe(0);
  });
  it('rejects malformed body, identifiers, versions and query operators without writes', async () => {
    for (const body of [
      { name: ' ' },
      { name: 'Good', phone: 'invalid' },
      { name: 'Good', email: 'bad' },
      { name: 'Good', notes: 'x'.repeat(2001) },
      { name: { $ne: '' } },
      [],
    ])
      expect(
        (
          await request(app)
            .post('/api/v1/clients')
            .set('Authorization', auth())
            .send(body)
        ).status,
      ).toBe(422);
    expect(
      (
        await request(app)
          .get('/api/v1/clients/not-an-id')
          .set('Authorization', auth())
      ).status,
    ).toBe(422);
    for (const query of [
      'status=all',
      'workspaceId=' + workspaceId,
      'cursor[$ne]=x',
      'limit=100000',
      'cursor=bad',
    ])
      expect(
        (
          await request(app)
            .get('/api/v1/clients?' + query)
            .set('Authorization', auth())
        ).status,
      ).toBe(422);
    const id = (await create()).body.data.id;
    for (const version of [0, 1.2, '1', null])
      expect(
        (
          await request(app)
            .put('/api/v1/clients/' + id)
            .set('Authorization', auth())
            .send({ name: 'Good', version })
        ).status,
      ).toBe(422);
    expect(
      (
        await request(app)
          .put('/api/v1/clients/' + id)
          .set('Authorization', auth())
          .send({ name: 'Good', version: 1, workspaceId })
      ).status,
    ).toBe(422);
    expect((await clientModel.findById(id).orFail()).version).toBe(1);
  });
  it('archives without deleting and makes archived records read-only', async () => {
    const id = (await create()).body.data.id;
    const archived = await request(app)
      .post('/api/v1/clients/' + id + '/archive')
      .set('Authorization', auth())
      .send({ version: 1 });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).toEqual(expect.any(String));
    expect(archived.body.data.version).toBe(2);
    expect(
      (await request(app).get('/api/v1/clients').set('Authorization', auth()))
        .body.data.items,
    ).toEqual([]);
    expect(
      (
        await request(app)
          .get('/api/v1/clients?status=archived')
          .set('Authorization', auth())
      ).body.data.items,
    ).toHaveLength(1);
    expect(
      (
        await request(app)
          .get('/api/v1/clients/' + id)
          .set('Authorization', auth())
      ).status,
    ).toBe(200);
    for (const response of [
      await request(app)
        .put('/api/v1/clients/' + id)
        .set('Authorization', auth())
        .send({ name: 'Changed', version: 2 }),
      await request(app)
        .post('/api/v1/clients/' + id + '/archive')
        .set('Authorization', auth())
        .send({ version: 2 }),
    ]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CLIENT_ARCHIVED');
    }
    expect(await clientModel.countDocuments()).toBe(1);
  });
  it('permits one concurrent update and refuses the stale version', async () => {
    const id = (await create()).body.data.id;
    const responses = await Promise.all(
      ['First', 'Second'].map((name) =>
        request(app)
          .put('/api/v1/clients/' + id)
          .set('Authorization', auth())
          .send({ name, version: 1 }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      responses.find((response) => response.status === 409)?.body.error.code,
    ).toBe('CLIENT_CONFLICT');
    const archived = await request(app)
      .post('/api/v1/clients/' + id + '/archive')
      .set('Authorization', auth())
      .send({ version: 1 });
    expect(archived.status).toBe(409);
    expect((await clientModel.findById(id).orFail()).version).toBe(2);
  });
  it('resolves a concurrent edit/archive without overwriting either winner', async () => {
    const id = (await create()).body.data.id;
    const responses = await Promise.all([
      request(app)
        .put('/api/v1/clients/' + id)
        .set('Authorization', auth())
        .send({ name: 'Edited', version: 1 }),
      request(app)
        .post('/api/v1/clients/' + id + '/archive')
        .set('Authorization', auth())
        .send({ version: 1 }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = responses.find((response) => response.status === 200)?.body
      .data;
    const saved = await clientModel.findById(id).orFail();
    expect(saved.version).toBe(2);
    expect(saved.name).toBe(winner.name);
    expect(saved.archivedAt?.toISOString() ?? null).toBe(winner.archivedAt);
  });
  it('bounds pages and returns a stable cursor with no duplicates', async () => {
    await clientModel.insertMany(
      Array.from({ length: 28 }, (_, index) => ({
        workspace: workspaceId,
        name: 'Client ' + index,
      })),
    );
    const first = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', auth());
    expect(first.body.data.items).toHaveLength(25);
    const second = await request(app)
      .get('/api/v1/clients?cursor=' + first.body.data.nextCursor)
      .set('Authorization', auth());
    expect(second.body.data.items).toHaveLength(3);
    expect(second.body.data.nextCursor).toBeNull();
    const ids: string[] = [
      ...first.body.data.items,
      ...second.body.data.items,
    ].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(28);
  });
  it.each(['owner', 'admin', 'member'])(
    'supports the documented current-member policy: %s',
    async (role) => {
      await models.Membership.updateOne({ workspace: workspaceId }, { role });
      expect((await create()).status).toBe(201);
    },
  );
  it('checks live membership before allowing writes', async () => {
    const id = (await create()).body.data.id;
    await models.Membership.deleteMany({});
    expect(
      (
        await request(app)
          .put('/api/v1/clients/' + id)
          .set('Authorization', auth())
          .send({ name: 'Denied', version: 1 })
      ).status,
    ).toBe(401);
    expect((await clientModel.findById(id).orFail()).version).toBe(1);
  });
  it('rejects missing, revoked and expired sessions', async () => {
    const anonymous = await request(app).get('/api/v1/clients');
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    expect(
      (
        await request(app)
          .post('/api/v1/clients')
          .set('Authorization', 'Bearer broken')
          .send(details)
      ).status,
    ).toBe(401);
    await sessionModel.updateMany({}, { expiresAt: new Date(0) });
    expect((await create()).status).toBe(401);
    await sessionModel.updateMany(
      {},
      { expiresAt: new Date(Date.now() + 100000), revokedAt: new Date() },
    );
    expect((await create()).status).toBe(401);
    expect(await clientModel.countDocuments()).toBe(0);
  });
  async function listing(query: Record<string, string> = {}) {
    return request(app)
      .get('/api/v1/clients')
      .query(query)
      .set('Authorization', auth());
  }
  it('finds literal substrings in name, company and email, independent of ASCII case', async () => {
    await clientModel.insertMany([
      {
        workspace: workspaceId,
        name: 'سارة أحمد',
        company: 'استوديو النور',
        email: 'sara@example.com',
      },
      {
        workspace: workspaceId,
        name: 'محمود علي',
        company: 'Blue Studio',
        email: 'mahmoud@example.net',
      },
      {
        workspace: workspaceId,
        name: 'ملاحظة خاصة',
        notes: 'OnlyNotesNeedle',
        phone: '01099988877',
      },
    ]);
    for (const [q, expected] of [
      [' سارة ', 'سارة أحمد'],
      ['النور', 'سارة أحمد'],
      ['BLUE', 'محمود علي'],
      ['SARA@EXAMPLE', 'سارة أحمد'],
    ]) {
      const result = await listing({ q: q ?? '' });
      expect(result.status).toBe(200);
      expect(
        result.body.data.items.map((item: { name: string }) => item.name),
      ).toEqual([expected]);
    }
    expect((await listing({ q: 'OnlyNotesNeedle' })).body.data.items).toEqual(
      [],
    );
    expect((await listing({ q: '01099988877' })).body.data.items).toEqual([]);
    expect((await listing({ q: '   ' })).body.data.items).toHaveLength(3);
  });
  it('escapes all regex punctuation instead of executing user expressions', async () => {
    const terms = [
      '.*',
      '[x]',
      '(a+)+$',
      '^',
      String.fromCharCode(92),
      'a|b',
      '?',
      '{}',
    ];
    await clientModel.insertMany(
      terms.map((term) => ({
        workspace: workspaceId,
        name: 'Literal ' + term,
      })),
    );
    await clientModel.create({
      workspace: workspaceId,
      name: 'Ordinary client',
    });
    for (const term of terms) {
      const result = await listing({ q: term });
      expect(result.status).toBe(200);
      expect(
        result.body.data.items.map((item: { name: string }) => item.name),
      ).toEqual(['Literal ' + term]);
    }
  });
  it('combines allowlisted contact filters with status and search', async () => {
    await clientModel.insertMany([
      { workspace: workspaceId, name: 'Team email', email: 'team@example.com' },
      { workspace: workspaceId, name: 'Team phone', phone: '12345' },
      {
        workspace: workspaceId,
        name: 'Team both',
        email: 'both@example.com',
        phone: '67890',
      },
      { workspace: workspaceId, name: 'Team none' },
      {
        workspace: workspaceId,
        name: 'Team archived',
        email: 'archived@example.com',
        archivedAt: new Date(),
      },
    ]);
    for (const [contact, count] of [
      ['all', 4],
      ['email', 2],
      ['phone', 2],
      ['none', 1],
    ] as const) {
      const result = await listing({ q: 'TEAM', contact });
      expect(result.status).toBe(200);
      expect(result.body.data.items).toHaveLength(count);
    }
    expect(
      (await listing({ contact: 'none', q: 'email' })).body.data.items,
    ).toEqual([]);
    expect(
      (await listing({ q: 'team', status: 'archived', contact: 'email' })).body
        .data.items,
    ).toHaveLength(1);
    expect(
      (await listing({ q: 'team', status: 'archived', contact: 'none' })).body
        .data.items,
    ).toEqual([]);
  });
  it('keeps the workspace predicate around every search alternative and pagination', async () => {
    const own = (await create()).body.data;
    await register.execute({ ...account, email: 'foreign@example.com' });
    const foreign = await sessions.login.execute({
      ...account,
      email: 'foreign@example.com',
    });
    await clientModel.insertMany([
      { workspace: foreign.identity.workspace.id, name: 'سارة foreign' },
      {
        workspace: foreign.identity.workspace.id,
        name: 'Company hit',
        company: 'استوديو سارة',
        email: 'sara@example.com',
      },
    ]);
    for (const q of ['سارة', 'sara@example', 'استوديو']) {
      const result = await listing({ q, contact: 'email' });
      expect(result.body.data.items).toHaveLength(1);
      expect(result.body.data.items[0].id).toBe(own.id);
    }
    token = foreign.accessToken;
    const result = await listing({ q: 'sara@example', cursor: own.id });
    expect(result.body.data.items).toEqual([]);
  });
  it('paginates within the filtered result, retaining filters on every page', async () => {
    await clientModel.insertMany([
      ...Array.from({ length: 28 }, (_, i) => ({
        workspace: workspaceId,
        name: 'Match ' + i,
        email: 'client' + i + '@example.com',
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        workspace: workspaceId,
        name: 'Unrelated ' + i,
        email: 'other' + i + '@example.com',
      })),
      { workspace: workspaceId, name: 'Match no contact' },
      {
        workspace: workspaceId,
        name: 'Match archive',
        email: 'archived@example.com',
        archivedAt: new Date(),
      },
    ]);
    const first = await listing({ q: 'match', contact: 'email' });
    expect(first.body.data.items).toHaveLength(25);
    const second = await listing({
      q: 'match',
      contact: 'email',
      cursor: first.body.data.nextCursor,
    });
    expect(second.body.data.items).toHaveLength(3);
    expect(second.body.data.nextCursor).toBeNull();
    const names: string[] = [
      ...first.body.data.items,
      ...second.body.data.items,
    ].map((item: { name: string }) => item.name);
    expect(new Set(names).size).toBe(28);
    expect(names.every((name) => /^Match [0-9]+$/u.test(name))).toBe(true);
  });
  it('rejects unbounded, duplicate, injected and unknown search options', async () => {
    for (const query of [
      'q=' + 'a'.repeat(101),
      'q=a%00b',
      'q=a%0Ab',
      'q=a&q=b',
      'q[$regex]=.*',
      'contact=invalid',
      'contact=email&contact=phone',
      'contact[$ne]=none',
      'sort=name',
      'limit=999',
      'fields=passwordHash',
      'status=all',
    ]) {
      const result = await request(app)
        .get('/api/v1/clients?' + query)
        .set('Authorization', auth());
      expect(result.status).toBe(422);
    }
    expect(await clientModel.countDocuments()).toBe(0);
  });
  it('reflects edits and archival in later searches without a separate search cache', async () => {
    const id = (await create()).body.data.id;
    expect((await listing({ q: 'سارة' })).body.data.items).toHaveLength(1);
    await request(app)
      .put('/api/v1/clients/' + id)
      .set('Authorization', auth())
      .send({ name: 'اسم جديد', email: 'updated@example.com', version: 1 });
    expect((await listing({ q: 'سارة' })).body.data.items).toEqual([]);
    expect(
      (await listing({ q: 'updated', contact: 'email' })).body.data.items,
    ).toHaveLength(1);
    await request(app)
      .post('/api/v1/clients/' + id + '/archive')
      .set('Authorization', auth())
      .send({ version: 2 });
    expect((await listing({ q: 'updated' })).body.data.items).toEqual([]);
    expect(
      (await listing({ q: 'updated', status: 'archived' })).body.data.items,
    ).toHaveLength(1);
  });
});
