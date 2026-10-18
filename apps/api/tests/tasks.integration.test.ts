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
import { createTasks } from '../src/main/create-tasks.js';
import { createProjects } from '../src/main/create-projects.js';
import { createTaskBoardModel } from '../src/modules/tasks/infrastructure/task-board-model.js';
import { MongoTaskBoardStore } from '../src/modules/tasks/infrastructure/mongo-task-board-store.js';
import { createProjectModel } from '../src/modules/projects/infrastructure/project-model.js';
import { createClientModel } from '../src/modules/clients/infrastructure/client-model.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { createConsumedRefreshModel } from '../src/modules/auth/infrastructure/consumed-refresh-model.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';
const account = {
  name: 'Ahmed',
  email: 'tasks@example.com',
  password: 'a long secure tasks passphrase',
};
describe('Project-scoped transactional task boards', () => {
  let replica: MongoMemoryReplSet,
    database: Awaited<ReturnType<typeof connectDatabase>>,
    models: ReturnType<typeof createRegistrationModels>,
    sessionModel: ReturnType<typeof createSessionModel>,
    consumed: ReturnType<typeof createConsumedRefreshModel>,
    clientModel: ReturnType<typeof createClientModel>,
    projectModel: ReturnType<typeof createProjectModel>,
    boardModel: ReturnType<typeof createTaskBoardModel>,
    register: RegisterAccount,
    sessions: Awaited<ReturnType<typeof createAuthentication>>,
    projects: ReturnType<typeof createProjects>,
    app: ReturnType<typeof createApp>,
    token: string,
    workspaceId: string,
    projectId: string,
    clientId: string;
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
    database = await connectDatabase(replica.getUri('task-tests'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    consumed = createConsumedRefreshModel(database);
    clientModel = createClientModel(database);
    projectModel = createProjectModel(database);
    boardModel = createTaskBoardModel(database);
    for (const model of [sessionModel, clientModel, projectModel, boardModel]) {
      await model.createCollection();
      await model.createIndexes();
    }
    sessions = await createAuthentication(
      models,
      sessionModel,
      'tasks-test-signing-secret-at-least-32-characters',
      false,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    projects = createProjects(database, projectModel, clientModel);
  }, 240000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      boardModel.deleteMany({}),
      projectModel.deleteMany({}),
      clientModel.deleteMany({}),
      consumed.deleteMany({}),
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
      await clientModel.create({
        workspace: workspaceId,
        name: 'Client',
        email: 'client@example.com',
      })
    ).id;
    projectId = (
      await projects.create(workspaceId, {
        clientId,
        title: 'Project',
        summary: 'Scope',
      })
    ).id;
    app = createApp('http://localhost:3000', {
      sessions,
      projects,
      tasks: createTasks(database, boardModel, projectModel),
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await database?.close();
    await replica?.stop();
  });
  const auth = () => 'Bearer ' + token;
  const route = (id = projectId) => '/api/v1/projects/' + id + '/tasks';
  const create = (
    version: number,
    title = 'Task',
    patch: Record<string, unknown> = {},
  ) =>
    request(app)
      .post(route())
      .set('Authorization', auth())
      .send({
        version,
        title,
        description: 'Details',
        priority: 'normal',
        ...patch,
      });
  const move = (
    id: string,
    version: number,
    status: string,
    beforeTaskId: string | null = null,
  ) =>
    request(app)
      .post(route() + '/' + id + '/move')
      .set('Authorization', auth())
      .send({ version, status, beforeTaskId });
  it('reads an empty board without writing and exposes only safe fields', async () => {
    const read = await request(app).get(route()).set('Authorization', auth());
    expect(read.status).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(read.body.data).toEqual({
      projectId,
      projectStatus: 'active',
      version: 0,
      tasks: [],
      progress: { total: 0, done: 0, percentage: null },
      clientView: {
        progress: { total: 0, done: 0, percentage: null },
        tasks: [],
      },
    });
    expect(await boardModel.countDocuments()).toBe(0);
    const created = await create(0);
    expect(created.status).toBe(201);
    expect(Object.keys(created.body.data).sort()).toEqual([
      'clientView',
      'progress',
      'projectId',
      'projectStatus',
      'tasks',
      'version',
    ]);
    expect(Object.keys(created.body.data.tasks[0]).sort()).toEqual([
      'clientVisible',
      'createdAt',
      'description',
      'id',
      'priority',
      'status',
      'title',
      'updatedAt',
    ]);
    expect(JSON.stringify(created.body)).not.toContain('taskReferenceRevision');
  });
  it('creates, updates, moves, reopens and deletes with stable order', async () => {
    const a = (await create(0, 'Task A')).body.data.tasks[0].id;
    const b = (await create(1, 'Task B')).body.data.tasks[1].id;
    const c = (await create(2, 'Task C')).body.data.tasks[2].id;
    const updated = await request(app)
      .put(route() + '/' + b)
      .set('Authorization', auth())
      .send({
        version: 3,
        title: 'Changed B',
        description: 'Updated',
        priority: 'high',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.tasks[1]).toMatchObject({
      id: b,
      priority: 'high',
      title: 'Changed B',
    });
    const reordered = await move(c, 4, 'todo', a);
    expect(
      reordered.body.data.tasks.map((task: { id: string }) => task.id),
    ).toEqual([c, a, b]);
    expect(
      (await move(a, 5, 'in_progress')).body.data.tasks.at(-1).status,
    ).toBe('in_progress');
    expect((await move(a, 6, 'done')).body.data.tasks.at(-1).status).toBe(
      'done',
    );
    expect(
      (await move(a, 7, 'todo', b)).body.data.tasks.map(
        (task: { id: string }) => task.id,
      ),
    ).toEqual([c, a, b]);
    const removed = await request(app)
      .delete(route() + '/' + a)
      .set('Authorization', auth())
      .send({ version: 8 });
    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({ version: 9 });
    expect(
      removed.body.data.tasks.map((task: { id: string }) => task.id),
    ).toEqual([c, b]);
    expect((await projectModel.findById(projectId).orFail()).version).toBe(1);
  });
  it.each([
    { workspace: 'fake' },
    { project: 'fake' },
    { id: new Types.ObjectId().toString() },
    { status: 'done' },
    { version: -1 },
    { version: 1.5 },
    { version: '0' },
    { title: 'x' },
    { title: 'x'.repeat(121) },
    { description: 'x'.repeat(2001) },
    { priority: 'urgent' },
  ])('rejects strict invalid creation %j', async (patch) => {
    expect((await create(0, 'Task', patch)).status).toBe(422);
    expect(await boardModel.countDocuments()).toBe(0);
  });
  it('rejects invalid positions and mass assignment in edit/delete/list', async () => {
    const a = (await create(0, 'Task A')).body.data.tasks[0].id;
    const b = (await create(1, 'Task B')).body.data.tasks[1].id;
    for (const method of ['post', 'put', 'delete'] as const) {
      const suffix = method === 'post' ? '' : '/' + a;
      expect(
        (
          await request(app)
            [method](route() + suffix + '?workspace=foreign')
            .set('Authorization', auth())
            .send({ version: 2, title: 'Ignored query' })
        ).status,
      ).toBe(422);
    }
    expect((await move(a, 2, 'todo', a)).status).toBe(422);
    expect(
      (await move(a, 2, 'todo', new Types.ObjectId().toString())).status,
    ).toBe(422);
    await move(b, 2, 'done');
    expect((await move(a, 3, 'todo', b)).body.error.code).toBe(
      'TASK_POSITION_INVALID',
    );
    expect(
      (
        await request(app)
          .put(route() + '/' + a)
          .set('Authorization', auth())
          .send({ version: 3, title: 'Task changed', status: 'done' })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .delete(route() + '/' + a)
          .set('Authorization', auth())
          .send({ version: 3, workspace: workspaceId })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .get(route() + '?status=todo')
          .set('Authorization', auth())
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .get(route() + '?version=1&version=2')
          .set('Authorization', auth())
      ).status,
    ).toBe(422);
  });
  it('isolates workspace, project and task identity and enforces live membership', async () => {
    const task = (await create(0)).body.data.tasks[0];
    const other = (
      await projects.create(workspaceId, {
        clientId,
        title: 'Second project',
        summary: '',
      })
    ).id;
    expect(
      (
        await request(app)
          .put(route(other) + '/' + task.id)
          .set('Authorization', auth())
          .send({ version: 0, title: 'Wrong task' })
      ).status,
    ).toBe(404);
    const foreign = { ...account, email: 'foreign@example.com' };
    await register.execute(foreign);
    const login = await sessions.login.execute(foreign);
    expect(
      (
        await request(app)
          .get(route())
          .set('Authorization', 'Bearer ' + login.accessToken)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(route())
          .set('Authorization', 'Bearer ' + login.accessToken)
          .send({ version: 1, title: 'Foreign write' })
      ).status,
    ).toBe(404);
    expect((await request(app).get(route())).status).toBe(401);
    await models.Membership.deleteOne({ workspace: workspaceId });
    expect((await create(1, 'Blocked')).status).toBe(401);
    expect((await boardModel.findOne().orFail()).tasks).toHaveLength(1);
  });
  it('allows held projects and preserves accepted financial snapshots', async () => {
    const accepted = await projects.createAccepted({
      workspaceId,
      sourceProposalId: new Types.ObjectId().toString(),
      title: 'Accepted',
      summary: 'Scope',
      terms: 'Terms',
      currency: 'EGP',
      items: [
        {
          title: 'Deliverable',
          quantity: 1,
          unitPriceMinor: 125050,
          totalMinor: 125050,
        },
      ],
      totalMinor: 125050,
      client: {
        id: clientId,
        name: 'Saved Client',
        company: 'Company',
        email: 'saved@example.com',
        phone: '',
      },
      acceptedAt: new Date(),
    });
    projectId = accepted.id;
    const before = await projects.read(workspaceId, projectId);
    expect((await create(0)).status).toBe(201);
    expect(await projects.read(workspaceId, projectId)).toEqual(before);
    await projects.changeStatus(workspaceId, projectId, 1, 'on_hold');
    expect((await create(1, 'Held task')).status).toBe(201);
    await projects.changeStatus(workspaceId, projectId, 2, 'cancelled');
    const read = await request(app).get(route()).set('Authorization', auth());
    expect(read.body.data.projectStatus).toBe('cancelled');
    expect(read.body.data.tasks).toHaveLength(2);
    const result = await create(2, 'Locked');
    expect(result.body.error.code).toBe('TASK_PROJECT_LOCKED');
    expect(result.status).toBe(409);
  });
  it('serializes two first creates and two moves without lost tasks', async () => {
    const creates = await Promise.all([
      create(0, 'Task A'),
      create(0, 'Task B'),
    ]);
    expect(creates.map((result) => result.status).sort()).toEqual([201, 409]);
    const board = creates.find((result) => result.status === 201)!.body.data;
    const a = board.tasks[0].id;
    const second = (await create(1, 'Task C')).body.data;
    const b = second.tasks[1].id;
    const moves = await Promise.all([
      move(a, 2, 'done'),
      move(b, 2, 'in_progress'),
    ]);
    expect(moves.map((result) => result.status).sort()).toEqual([200, 409]);
    const saved = (await request(app).get(route()).set('Authorization', auth()))
      .body.data;
    expect(saved.version).toBe(3);
    expect(saved.tasks).toHaveLength(2);
    expect(
      new Set(saved.tasks.map((task: { id: string }) => task.id)).size,
    ).toBe(2);
    expect((await move(a, 2, 'todo')).body.error.code).toBe('TASK_CONFLICT');
  });
  it('rolls back project reservation when board persistence fails', async () => {
    vi.spyOn(MongoTaskBoardStore.prototype, 'save').mockRejectedValueOnce(
      new Error('storage failed'),
    );
    expect((await create(0)).status).toBe(500);
    expect(await boardModel.countDocuments()).toBe(0);
    expect(
      (await projectModel.findById(projectId).orFail()).taskReferenceRevision,
    ).toBe(0);
  });
  it('orders a task write against project completion', async () => {
    const results = await Promise.all([
      create(0, 'Racing task'),
      projects.changeStatus(workspaceId, projectId, 1, 'completed'),
    ]);
    expect([201, 409]).toContain(results[0].status);
    expect((await projects.read(workspaceId, projectId)).status).toBe(
      'completed',
    );
    const read = (await request(app).get(route()).set('Authorization', auth()))
      .body.data;
    expect(read.tasks.length).toBe(results[0].status === 201 ? 1 : 0);
    expect((await create(read.version, 'After close')).body.error.code).toBe(
      'TASK_PROJECT_LOCKED',
    );
  });
  const visibility = (id: string, version: number, clientVisible: boolean) =>
    request(app)
      .post(route() + '/' + id + '/visibility')
      .set('Authorization', auth())
      .send({ version, clientVisible });
  it('TSK-002 derives progress and a separate client view through content, moves and visibility changes', async () => {
    const a = (await create(0, 'Private finished work')).body.data.tasks[0].id;
    const b = (await create(1, 'Visible work')).body.data.tasks[1].id;
    await create(2, 'Private notes');
    const finished = (await move(a, 3, 'done')).body.data;
    expect(finished.progress).toEqual({ total: 3, done: 1, percentage: 33 });
    expect(finished.clientView).toEqual({
      progress: { total: 0, done: 0, percentage: null },
      tasks: [],
    });
    const allowed = (await visibility(a, 4, true)).body.data;
    expect(allowed.progress).toEqual(finished.progress);
    expect(allowed.clientView.progress).toEqual({
      total: 1,
      done: 1,
      percentage: 100,
    });
    await visibility(b, 5, true);
    const edited = (
      await request(app)
        .put(route() + '/' + b)
        .set('Authorization', auth())
        .send({
          version: 6,
          title: 'Client deliverable',
          description: 'Public scope',
          priority: 'low',
        })
    ).body.data;
    expect(
      edited.tasks.find((task: { id: string }) => task.id === b).clientVisible,
    ).toBe(true);
    expect(edited.clientView.progress).toEqual({
      total: 2,
      done: 1,
      percentage: 50,
    });
    const moved = (await move(b, 7, 'in_progress')).body.data;
    expect(
      moved.tasks.find((task: { id: string }) => task.id === b).clientVisible,
    ).toBe(true);
    const hidden = (await visibility(a, 8, false)).body.data;
    expect(hidden.clientView).toEqual({
      progress: { total: 1, done: 0, percentage: 0 },
      tasks: [
        {
          title: 'Client deliverable',
          description: 'Public scope',
          status: 'in_progress',
        },
      ],
    });
    expect(Object.keys(hidden.clientView).sort()).toEqual([
      'progress',
      'tasks',
    ]);
    expect(JSON.stringify(hidden.clientView)).not.toContain('Private');
    expect(JSON.stringify(hidden.clientView)).not.toContain('priority');
    expect(JSON.stringify(hidden.clientView)).not.toContain('createdAt');
    const removed = (
      await request(app)
        .delete(route() + '/' + b)
        .set('Authorization', auth())
        .send({ version: 9 })
    ).body.data;
    expect(removed.progress).toEqual({ total: 2, done: 1, percentage: 50 });
    expect(removed.clientView.progress.percentage).toBeNull();
    expect((await projectModel.findById(projectId).orFail()).version).toBe(1);
    await projects.changeStatus(workspaceId, projectId, 1, 'completed');
    const read = (await request(app).get(route()).set('Authorization', auth()))
      .body.data;
    expect(read.progress.percentage).toBe(50);
    expect((await visibility(a, 10, true)).body.error.code).toBe(
      'TASK_PROJECT_LOCKED',
    );
    expect((await boardModel.findOne().orFail()).version).toBe(10);
  });
  it('TSK-002 keeps legacy tasks private and materializes the default only on a saved change', async () => {
    const id = (await create(0)).body.data.tasks[0].id;
    await boardModel.collection.updateOne(
      { project: new Types.ObjectId(projectId) },
      { $unset: { 'tasks.0.clientVisible': '' } },
    );
    const read = (await request(app).get(route()).set('Authorization', auth()))
      .body.data;
    expect(read.tasks[0].clientVisible).toBe(false);
    expect(read.clientView.tasks).toEqual([]);
    expect(read.version).toBe(1);
    expect(
      (
        await boardModel.collection.findOne({
          project: new Types.ObjectId(projectId),
        })
      )?.tasks[0],
    ).not.toHaveProperty('clientVisible');
    await move(id, 1, 'done');
    expect(
      (
        await boardModel.collection.findOne({
          project: new Types.ObjectId(projectId),
        })
      )?.tasks[0].clientVisible,
    ).toBe(false);
  });
  it('TSK-002 serializes visibility and content edits without silently losing either intent', async () => {
    const id = (await create(0)).body.data.tasks[0].id;
    const results = await Promise.all([
      visibility(id, 1, true),
      request(app)
        .put(route() + '/' + id)
        .set('Authorization', auth())
        .send({ version: 1, title: 'Changed content' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((await boardModel.findOne().orFail()).version).toBe(2);
    if (results[0].status === 409) await visibility(id, 2, true);
    else
      await request(app)
        .put(route() + '/' + id)
        .set('Authorization', auth())
        .send({ version: 2, title: 'Changed content' });
    const read = (await request(app).get(route()).set('Authorization', auth()))
      .body.data;
    expect(read.tasks[0]).toMatchObject({
      title: 'Changed content',
      clientVisible: true,
    });
    expect(read.version).toBe(3);
  });
  it.each([
    { version: 1, clientVisible: 'true' },
    { version: 1, clientVisible: 1 },
    { version: 1 },
    { version: -1, clientVisible: true },
    { version: 1.5, clientVisible: true },
    { version: 1, clientVisible: true, workspace: 'foreign' },
    { version: 1, clientVisible: true, title: 'Injected' },
  ])('TSK-002 rejects invalid or mass-assigned visibility %j', async (body) => {
    const id = (await create(0)).body.data.tasks[0].id;
    expect(
      (
        await request(app)
          .post(route() + '/' + id + '/visibility')
          .set('Authorization', auth())
          .send(body)
      ).status,
    ).toBe(422);
    expect((await boardModel.findOne().orFail()).version).toBe(1);
    expect((await boardModel.findOne().orFail()).tasks[0]?.clientVisible).toBe(
      false,
    );
  });
  it('TSK-002 enforces task/project/workspace and authenticated membership for visibility', async () => {
    const id = (await create(0)).body.data.tasks[0].id;
    const other = await projects.create(workspaceId, {
      clientId,
      title: 'Other',
      summary: '',
    });
    expect(
      (
        await request(app)
          .post(route(other.id) + '/' + id + '/visibility')
          .set('Authorization', auth())
          .send({ version: 0, clientVisible: true })
      ).status,
    ).toBe(404);
    expect(
      (await visibility(new Types.ObjectId().toString(), 1, true)).status,
    ).toBe(404);
    const foreign = { ...account, email: 'visibility-foreign@example.com' };
    await register.execute(foreign);
    const login = await sessions.login.execute(foreign);
    expect(
      (
        await request(app)
          .post(route() + '/' + id + '/visibility')
          .set('Authorization', 'Bearer ' + login.accessToken)
          .send({ version: 1, clientVisible: true })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(route() + '/' + id + '/visibility')
          .send({ version: 1, clientVisible: true })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .put(route() + '/' + id)
          .set('Authorization', auth())
          .send({ version: 1, title: 'Content', clientVisible: true })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .post(route())
          .set('Authorization', auth())
          .send({ version: 1, title: 'Content', clientVisible: true })
      ).status,
    ).toBe(422);
    await models.Membership.deleteOne({ workspace: workspaceId });
    expect((await visibility(id, 1, true)).status).toBe(401);
    expect((await boardModel.findOne().orFail()).version).toBe(1);
  });
  it('TSK-002 rolls back a failed visibility change including the project reservation', async () => {
    const id = (await create(0)).body.data.tasks[0].id;
    const counter = (await projectModel.findById(projectId).orFail())
      .taskReferenceRevision;
    vi.spyOn(MongoTaskBoardStore.prototype, 'save').mockRejectedValueOnce(
      new Error('Visibility persistence failed'),
    );
    expect((await visibility(id, 1, true)).status).toBe(500);
    const board = await boardModel.findOne().orFail();
    expect(board.version).toBe(1);
    expect(board.tasks[0]?.clientVisible).toBe(false);
    expect(
      (await projectModel.findById(projectId).orFail()).taskReferenceRevision,
    ).toBe(counter);
  });
  it('bounds the board and permits a replacement after deletion', async () => {
    const now = new Date();
    const entries = Array.from({ length: 200 }, (_, index) => ({
      _id: new Types.ObjectId(),
      title: 'Task ' + index,
      description: '',
      status: 'todo',
      priority: 'normal',
      createdAt: now,
      updatedAt: now,
    }));
    await boardModel.create({
      workspace: workspaceId,
      project: projectId,
      version: 1,
      tasks: entries,
    });
    expect((await create(1, 'Over limit')).body.error.code).toBe(
      'TASK_LIMIT_REACHED',
    );
    const deleted = await request(app)
      .delete(route() + '/' + entries[0]!._id.toString())
      .set('Authorization', auth())
      .send({ version: 1 });
    expect(deleted.body.data.tasks).toHaveLength(199);
    expect((await create(2, 'Replacement')).body.data.tasks).toHaveLength(200);
  });
});
