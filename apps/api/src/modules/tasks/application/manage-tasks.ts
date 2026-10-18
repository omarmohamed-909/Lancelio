import { clientTaskView, taskProgress } from '../domain/task-progress.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
import {
  moveTask,
  requireTask,
  taskLimit,
  validateTaskInput,
  validateTaskStatus,
  validateTaskVersion,
} from '../domain/task-board.js';
import type { Task, TaskBoard, TaskInput } from '../domain/task-board.js';
import type {
  TaskBoardStore,
  TaskProjectDirectory,
  TaskTransactions,
} from './ports/task-board-store.js';
export class ManageTasks {
  constructor(
    private readonly boards: TaskBoardStore,
    private readonly projects: TaskProjectDirectory,
    private readonly transactions: TaskTransactions,
    private readonly newId: () => string,
    private readonly now: () => Date,
  ) {}
  async read(workspaceId: string, projectId: string): Promise<TaskBoard> {
    const scope = validateId(workspaceId),
      project = validateId(projectId);
    const status = await this.projects.read(scope, project);
    if (!status)
      throw new ApplicationError('TASK_PROJECT_NOT_FOUND', 'Project not found');
    const board = await this.boards.find(scope, project);
    const tasks = board?.tasks ?? [];
    return {
      projectId: project,
      projectStatus: status,
      version: board?.version ?? 0,
      tasks,
      progress: taskProgress(tasks),
      clientView: clientTaskView(tasks),
    };
  }
  create(
    workspaceId: string,
    projectId: string,
    version: number,
    input: TaskInput,
  ) {
    const content = validateTaskInput(input),
      id = validateId(this.newId());
    return this.change(workspaceId, projectId, version, (tasks, now) => {
      if (tasks.length >= taskLimit)
        throw new ApplicationError(
          'TASK_LIMIT_REACHED',
          'A project can have up to 200 tasks',
        );
      return [
        ...tasks,
        {
          ...content,
          id,
          status: 'todo',
          clientVisible: false,
          createdAt: now,
          updatedAt: now,
        },
      ];
    });
  }
  update(
    workspaceId: string,
    projectId: string,
    id: string,
    version: number,
    input: TaskInput,
  ) {
    const taskId = validateId(id),
      content = validateTaskInput(input);
    return this.change(workspaceId, projectId, version, (tasks, now) => {
      requireTask(tasks, taskId);
      return tasks.map((task) =>
        task.id === taskId ? { ...task, ...content, updatedAt: now } : task,
      );
    });
  }
  move(
    workspaceId: string,
    projectId: string,
    id: string,
    version: number,
    status: string,
    beforeTaskId: string | null,
  ) {
    const taskId = validateId(id),
      next = validateTaskStatus(status),
      anchor = beforeTaskId === null ? null : validateId(beforeTaskId);
    return this.change(workspaceId, projectId, version, (tasks, now) =>
      moveTask(tasks, taskId, next, anchor, now),
    );
  }
  setClientVisibility(
    workspaceId: string,
    projectId: string,
    id: string,
    version: number,
    clientVisible: boolean,
  ) {
    const taskId = validateId(id);
    if (typeof clientVisible !== 'boolean')
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid task visibility');
    return this.change(workspaceId, projectId, version, (tasks, now) => {
      requireTask(tasks, taskId);
      return tasks.map((task) =>
        task.id === taskId ? { ...task, clientVisible, updatedAt: now } : task,
      );
    });
  }
  remove(workspaceId: string, projectId: string, id: string, version: number) {
    const taskId = validateId(id);
    return this.change(workspaceId, projectId, version, (tasks) => {
      requireTask(tasks, taskId);
      return tasks.filter((task) => task.id !== taskId);
    });
  }
  private change(
    workspaceId: string,
    projectId: string,
    version: number,
    update: (tasks: Task[], now: Date) => Task[],
  ) {
    const scope = validateId(workspaceId),
      project = validateId(projectId);
    validateTaskVersion(version);
    return this.transactions.execute(async ({ boards, projects }) => {
      const status = await projects.reserve(scope, project);
      if (!status)
        throw new ApplicationError(
          'TASK_PROJECT_NOT_FOUND',
          'Project not found',
        );
      if (status === 'completed' || status === 'cancelled')
        throw new ApplicationError(
          'TASK_PROJECT_LOCKED',
          'This project is read-only',
        );
      const current = await boards.find(scope, project);
      if ((current?.version ?? 0) !== version)
        throw new ApplicationError(
          'TASK_CONFLICT',
          'Tasks changed; reload before another write',
        );
      const saved = await boards.save(
        scope,
        project,
        version,
        update(current?.tasks ?? [], this.now()),
      );
      if (!saved)
        throw new ApplicationError(
          'TASK_CONFLICT',
          'Tasks changed; reload before another write',
        );
      return {
        projectId: project,
        projectStatus: status,
        ...saved,
        progress: taskProgress(saved.tasks),
        clientView: clientTaskView(saved.tasks),
      };
    });
  }
}
