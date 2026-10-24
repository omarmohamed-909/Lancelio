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
import { connectDatabase } from '../src/main/database.js';
import { createApp } from '../src/main/create-app.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { createClientAccess } from '../src/main/create-client-access.js';
import { createClientAccessModel } from '../src/modules/portal/infrastructure/client-access-model.js';
import { createPortalModel } from '../src/modules/portal/infrastructure/portal-model.js';
import { createClientModel } from '../src/modules/clients/infrastructure/client-model.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import {
  ResendClientInvitation,
  clientInvitationTemplate,
} from '../src/modules/portal/infrastructure/resend-client-invitation.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
const origin = 'http://localhost:3100';
describe('Account-bound client invitations', () => {
  let replica: MongoMemoryReplSet,
    db: Awaited<ReturnType<typeof connectDatabase>>;
  let users: ReturnType<typeof createRegistrationModels>,
    clients: ReturnType<typeof createClientModel>,
    access: ReturnType<typeof createClientAccessModel>;
  let service: ReturnType<typeof createClientAccess>,
    app: ReturnType<typeof createApp>;
  let ownerId: string,
    clientUserId: string,
    strangerId: string,
    scope: string,
    clientWorkspace: string,
    clientId: string;
  let ownerToken: string, clientToken: string, strangerToken: string, now: Date;
  const mailer = { send: vi.fn(async () => {}) };
  const actor = () => ({ userId: ownerId, workspaceId: scope, role: 'owner' });
  const issue = () =>
    service.issue(actor(), clientId, 0, 'ar', 'client@example.com');
  const first = { projects: null, invoices: null };
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({
      binary: {
        ...mongoBinaryOptions(),
        downloadDir: resolve(
          import.meta.dirname,
          '../../../.cache/mongodb-binaries',
        ),
      },
      replSet: { count: 1 },
    });
    db = await connectDatabase(replica.getUri('client-access-tests'));
    users = createRegistrationModels(db);
    await initializeRegistrationModels(users);
    clients = createClientModel(db);
    access = createClientAccessModel(db);
    const grants = createPortalModel(db),
      sessionsModel = createSessionModel(db);
    for (const model of [clients, access, grants, sessionsModel]) {
      await model.createCollection();
      await model.createIndexes();
    }
    for (const name of [
      'accessprojects',
      'accesstasks',
      'accessinvoices',
      'accesspayments',
    ])
      await db.createCollection(name);
    const hash = await new Argon2PasswordHasher().hash(
      'invitation account secure passphrase',
    );
    const credentials = [];
    for (const [name, email] of [
      ['Studio Owner', 'owner@example.com'],
      ['Client Owner', 'client@example.com'],
      ['Other Person', 'other@example.com'],
    ] as const) {
      const user = await users.User.create({ name, email, passwordHash: hash });
      const workspace = await users.Workspace.create({
        name: name + ' workspace',
        slug: String(user._id),
        owner: user._id,
      });
      await users.Membership.create({
        workspace: workspace._id,
        user: user._id,
        role: 'owner',
      });
      credentials.push({ user, workspace, email: email! });
    }
    ownerId = String(credentials[0]!.user._id);
    scope = String(credentials[0]!.workspace._id);
    clientUserId = String(credentials[1]!.user._id);
    clientWorkspace = String(credentials[1]!.workspace._id);
    strangerId = String(credentials[2]!.user._id);
    const sessions = await createAuthentication(
      users,
      sessionsModel,
      'client-invitation-test-secret-with-32-characters',
      false,
    );
    const tokens = [];
    for (const credential of credentials)
      tokens.push(
        (
          await sessions.login.execute({
            email: credential.email,
            password: 'invitation account secure passphrase',
          })
        ).accessToken,
      );
    [ownerToken, clientToken, strangerToken] = tokens as [
      string,
      string,
      string,
    ];
    service = createClientAccess(
      db,
      access,
      grants,
      {
        users: users.User.collection.name,
        clients: clients.collection.name,
        workspaces: users.Workspace.collection.name,
        projects: 'accessprojects',
        tasks: 'accesstasks',
        invoices: 'accessinvoices',
        payments: 'accesspayments',
      },
      mailer,
      () => now,
    );
    app = createApp(origin, { sessions, clientAccess: service });
  }, 240000);
  beforeEach(async () => {
    now = new Date();
    mailer.send.mockReset();
    mailer.send.mockResolvedValue(undefined);
    await access.deleteMany({});
    await clients.deleteMany({});
    for (const name of [
      'accessprojects',
      'accesstasks',
      'accessinvoices',
      'accesspayments',
    ])
      await db.collection(name).deleteMany({});
    await users.User.updateMany({}, { $set: { emailVerified: false } });
    clientId = String(
      (
        await clients.create({
          workspace: scope,
          name: 'Our shared client',
          email: 'client@example.com',
          notes: 'PRIVATE OWNER NOTE',
        })
      )._id,
    );
  });
  afterAll(async () => {
    await db?.close();
    await replica?.stop();
  });
  it('requires email ownership for discovery and acceptance, with a secure invitation-link fallback', async () => {
    const result = await issue();
    expect((await service.list(clientUserId)).items).toEqual([]);
    await expect(
      service.decide(clientUserId, result.access.id, 1, true, null),
    ).rejects.toMatchObject({ code: 'CLIENT_EMAIL_VERIFICATION_REQUIRED' });
    expect((await service.resolve(clientUserId, result.token)).id).toBe(
      result.access.id,
    );
    await service.decide(clientUserId, result.access.id, 1, true, result.token);
    const list = await service.list(clientUserId);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.state).toBe('accepted');
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer ' + clientToken);
    expect(me.body.data.workspace.id).toBe(clientWorkspace);
    expect(me.body.data.membership.role).toBe('owner');
    expect(
      await users.Membership.countDocuments({
        user: clientUserId,
        workspace: scope,
      }),
    ).toBe(0);
    const saved = await access
      .findById(result.access.id)
      .select('+digest')
      .lean();
    expect(saved?.digest).toBeNull();
  });
  it('discovers pending invitations for verified email and permits acceptance without a token', async () => {
    const result = await issue();
    await users.User.updateOne(
      { _id: clientUserId },
      { $set: { emailVerified: true } },
    );
    expect((await service.list(clientUserId)).items[0]?.id).toBe(
      result.access.id,
    );
    await service.decide(clientUserId, result.access.id, 1, true, null);
    expect(
      (await service.page(clientUserId, result.access.id, first)).workspaceName,
    ).toBe('Studio Owner workspace');
  });
  it('rejects another account even with the invitation secret, access ID, and matching revision', async () => {
    const result = await issue();
    await expect(
      service.resolve(strangerId, result.token),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    await expect(
      service.decide(strangerId, result.access.id, 1, true, result.token),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    await service.decide(clientUserId, result.access.id, 1, true, result.token);
    await expect(
      service.page(strangerId, result.access.id, first),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
  });
  it('restricts owner controls to the correct workspace and owner/admin roles', async () => {
    await expect(
      service.issue(
        { ...actor(), role: 'member' },
        clientId,
        0,
        'ar',
        'client@example.com',
      ),
    ).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' });
    await expect(
      service.issue(
        { ...actor(), workspaceId: clientWorkspace },
        clientId,
        0,
        'ar',
        'client@example.com',
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_ARCHIVED' });
    expect(mailer.send).not.toHaveBeenCalled();
  });
  it('returns only client-scoped work, issued invoice balances, and explicitly visible tasks', async () => {
    const result = await issue();
    await service.decide(clientUserId, result.access.id, 1, true, result.token);
    const project = new Types.ObjectId(),
      invoice = new Types.ObjectId(),
      other = new Types.ObjectId();
    const workspace = new Types.ObjectId(scope),
      client = { id: new Types.ObjectId(clientId) };
    await db.collection('accessprojects').insertMany([
      {
        _id: project,
        workspace,
        client,
        title: 'SHARED PROJECT',
        status: 'active',
        summary: 'Agreed work',
      },
      {
        workspace,
        client: { id: other },
        title: 'OTHER CLIENT SECRET',
        status: 'active',
      },
    ]);
    await db.collection('accesstasks').insertOne({
      workspace,
      project,
      tasks: [
        {
          title: 'VISIBLE TASK',
          description: '',
          status: 'done',
          clientVisible: true,
        },
        { title: 'HIDDEN TASK', status: 'todo', clientVisible: false },
      ],
    });
    await db.collection('accessinvoices').insertMany([
      {
        _id: invoice,
        workspace,
        client,
        title: 'ISSUED',
        number: 'INV-001',
        status: 'issued',
        currency: 'USD',
        totalMinor: 2000,
        issuedAt: now,
      },
      { workspace, client, title: 'PRIVATE DRAFT', status: 'draft' },
    ]);
    await db.collection('accesspayments').insertOne({
      workspace,
      invoice,
      entries: [{ amountMinor: 500, note: 'PRIVATE PAYMENT NOTE' }],
    });
    const page = await service.page(clientUserId, result.access.id, first),
      serialized = JSON.stringify(page);
    expect(page.projects[0]?.tasks).toHaveLength(1);
    expect(page.invoices[0]?.remainingMinor).toBe(1500);
    expect(serialized).toContain('VISIBLE TASK');
    for (const secret of [
      'OTHER CLIENT SECRET',
      'HIDDEN TASK',
      'PRIVATE DRAFT',
      'PRIVATE OWNER NOTE',
      'PRIVATE PAYMENT NOTE',
    ])
      expect(serialized).not.toContain(secret);
  });
  it('revokes access immediately without affecting the recipient workspace', async () => {
    const result = await issue();
    await service.decide(clientUserId, result.access.id, 1, true, result.token);
    await service.revoke(actor(), clientId, 2);
    await expect(
      service.page(clientUserId, result.access.id, first),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    expect((await service.list(clientUserId)).items).toHaveLength(0);
    expect(
      await users.Workspace.exists({
        _id: clientWorkspace,
        owner: clientUserId,
      }),
    ).not.toBeNull();
  });
  it('lets recipients decline or leave, invalidating old acceptance links', async () => {
    const firstInvite = await issue();
    await service.decide(
      clientUserId,
      firstInvite.access.id,
      1,
      false,
      firstInvite.token,
    );
    await expect(
      service.decide(
        clientUserId,
        firstInvite.access.id,
        1,
        true,
        firstInvite.token,
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    const second = await service.issue(
      actor(),
      clientId,
      2,
      'en',
      'client@example.com',
    );
    await service.decide(clientUserId, second.access.id, 3, true, second.token);
    await service.leave(clientUserId, second.access.id, 4);
    await expect(
      service.page(clientUserId, second.access.id, first),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
  });
  it('expires pending invitations after seven days but keeps accepted access until explicitly revoked', async () => {
    const result = await issue();
    now = new Date(now.getTime() + 8 * 86400000);
    await expect(
      service.resolve(clientUserId, result.token),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    const next = await service.issue(
      actor(),
      clientId,
      1,
      'ar',
      'client@example.com',
    );
    await service.decide(clientUserId, next.access.id, 2, true, next.token);
    now = new Date(now.getTime() + 10 * 86400000);
    expect(
      (await service.page(clientUserId, next.access.id, first)).projects,
    ).toEqual([]);
  });
  it('blocks archived clients, changed client emails and suspended users on every read', async () => {
    const result = await issue();
    await service.decide(clientUserId, result.access.id, 1, true, result.token);
    await clients.updateOne(
      { _id: clientId },
      { $set: { email: 'new@example.com' } },
    );
    await expect(
      service.page(clientUserId, result.access.id, first),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    const ownerView = await service.readOwner(actor(), clientId);
    expect(ownerView.access).toBeNull();
    expect(ownerView.version).toBe(2);
    await clients.updateOne(
      { _id: clientId },
      { $set: { email: 'client@example.com', archivedAt: now } },
    );
    await expect(
      service.page(clientUserId, result.access.id, first),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    await clients.updateOne({ _id: clientId }, { $set: { archivedAt: null } });
    await users.User.updateOne(
      { _id: clientUserId },
      { $set: { status: 'suspended' } },
    );
    await expect(
      service.page(clientUserId, result.access.id, first),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    await users.User.updateOne(
      { _id: clientUserId },
      { $set: { status: 'active' } },
    );
  });
  it('does not grant pending invites access and replaces old tokens on reissue', async () => {
    const result = await issue();
    await expect(
      service.page(clientUserId, result.access.id, first),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    const next = await service.issue(
      actor(),
      clientId,
      1,
      'ar',
      'client@example.com',
    );
    await expect(
      service.resolve(clientUserId, result.token),
    ).rejects.toMatchObject({ code: 'CLIENT_INVITATION_UNAVAILABLE' });
    expect((await service.resolve(clientUserId, next.token)).version).toBe(2);
  });
  it('never sends to an email changed after the owner reviewed it', async () => {
    await clients.updateOne(
      { _id: clientId },
      { $set: { email: 'changed@example.com' } },
    );
    await expect(issue()).rejects.toMatchObject({ code: 'PORTAL_CONFLICT' });
    expect(mailer.send).not.toHaveBeenCalled();
    expect(await access.countDocuments()).toBe(0);
  });
  it('pages large account collections without dropping portals or mixing recipients', async () => {
    const rows = Array.from({ length: 101 }, () => ({
      _id: new Types.ObjectId(),
      workspace: new Types.ObjectId(scope),
      name: 'Shared client',
      email: 'client@example.com',
      archivedAt: null,
    }));
    await clients.collection.insertMany(rows);
    await access.insertMany(
      rows.map((client) => ({
        workspace: scope,
        client: client._id,
        email: 'client@example.com',
        user: clientUserId,
        state: 'accepted',
        version: 2,
        expiresAt: now,
      })),
    );
    const firstPage = await service.list(clientUserId);
    expect(firstPage.items).toHaveLength(100);
    expect(firstPage.hasMore).toBe(true);
    const lastPage = await service.list(clientUserId, firstPage.nextCursor);
    expect(lastPage.items).toHaveLength(1);
    expect(lastPage.hasMore).toBe(false);
    expect(
      firstPage.items.some((item) => item.id === lastPage.items[0]?.id),
    ).toBe(false);
    expect((await service.list(strangerId)).items).toHaveLength(0);
  });
  it('serializes concurrent creation and acceptance to one winning revision', async () => {
    const issued = await Promise.allSettled([issue(), issue()]);
    expect(issued.filter((value) => value.status === 'fulfilled')).toHaveLength(
      1,
    );
    const result = issued.find((value) => value.status === 'fulfilled')!;
    if (result.status !== 'fulfilled') throw new Error('Missing winner');
    const decisions = await Promise.allSettled([
      service.decide(
        clientUserId,
        result.value.access.id,
        1,
        true,
        result.value.token,
      ),
      service.decide(
        clientUserId,
        result.value.access.id,
        1,
        true,
        result.value.token,
      ),
    ]);
    expect(
      decisions.filter((value) => value.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
  it('keeps a usable manual link when mail is unavailable, without claiming delivery', async () => {
    mailer.send.mockRejectedValueOnce(new Error('Provider timeout'));
    const result = await issue();
    expect(result.delivery).toBe('failed');
    expect((await service.resolve(clientUserId, result.token)).id).toBe(
      result.access.id,
    );
  });
  it('authenticates HTTP endpoints, rejects foreign origins and returns no-store data without digests', async () => {
    expect((await request(app).get('/api/v1/client-access/list')).status).toBe(
      401,
    );
    const foreign = await request(app)
      .post('/api/v1/client-access/owner/' + clientId)
      .set('Authorization', 'Bearer ' + ownerToken)
      .set('Origin', 'https://foreign.example')
      .send({ version: 0, locale: 'ar', email: 'client@example.com' });
    expect(foreign.status).toBe(403);
    expect(mailer.send).not.toHaveBeenCalled();
    const created = await request(app)
      .post('/api/v1/client-access/owner/' + clientId)
      .set('Authorization', 'Bearer ' + ownerToken)
      .set('Origin', origin)
      .send({ version: 0, locale: 'ar', email: 'client@example.com' });
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(created.body)).not.toContain('digest');
    expect(
      (
        await request(app)
          .post('/api/v1/client-access/resolve')
          .set('Authorization', 'Bearer ' + strangerToken)
          .set('Origin', origin)
          .send({ token: created.body.data.token })
      ).status,
    ).toBe(404);
  });
  it('escapes names and isolates Arabic layout, uses canonical fragment links and provider idempotency', async () => {
    const result = await issue();
    const message = {
      ...result.access,
      workspaceName: '<img src=x onerror=alert(1)>',
    };
    const content = clientInvitationTemplate(
      message,
      result.token,
      'ar',
      'https://www.lancelio.tech',
    );
    expect(content.html).toContain('direction:rtl;text-align:right');
    expect(content.html).toContain('&lt;img');
    expect(content.html).not.toContain('<img');
    expect(content.text).toContain('https://www.lancelio.tech/connections#');
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await new ResendClientInvitation(
      'secret',
      'hello@updates.lancelio.tech',
      'https://www.lancelio.tech',
      send,
    ).send(message, result.token, 'en');
    expect(send.mock.calls[0]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': `client-invitation/${message.id}/${message.version}`,
    });
  });
});
