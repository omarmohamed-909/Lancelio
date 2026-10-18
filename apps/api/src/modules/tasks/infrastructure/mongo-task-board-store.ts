import type { ClientSession, InferSchemaType } from 'mongoose';
import type { TaskBoardStore } from '../application/ports/task-board-store.js';
import type { Task, StoredTaskBoard } from '../domain/task-board.js';
import { validateTaskInput, validateTaskStatus } from '../domain/task-board.js';
import type { TaskBoardModel } from './task-board-model.js';
function dto(
  record: InferSchemaType<TaskBoardModel['schema']>,
): StoredTaskBoard {
  return {
    version: record.version,
    tasks: record.tasks.map((task) => ({
      id: task._id.toString(),
      ...validateTaskInput(task),
      status: validateTaskStatus(task.status),
      clientVisible: task.clientVisible === true,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    })),
  };
}
export class MongoTaskBoardStore implements TaskBoardStore {
  constructor(
    private readonly model: TaskBoardModel,
    private readonly session?: ClientSession,
  ) {}
  async find(workspaceId: string, projectId: string) {
    const record = await this.model
      .findOne({ workspace: workspaceId, project: projectId })
      .session(this.session ?? null)
      .maxTimeMS(3000)
      .lean();
    return record ? dto(record) : null;
  }
  async save(
    workspaceId: string,
    projectId: string,
    version: number,
    tasks: Task[],
  ) {
    const entries = tasks.map(({ id, ...content }) => ({
      _id: id,
      ...content,
    }));
    if (version === 0) {
      const [record] = await this.model.create(
        [
          {
            workspace: workspaceId,
            project: projectId,
            version: 1,
            tasks: entries,
          },
        ],
        this.session ? { session: this.session } : {},
      );
      if (!record) throw new Error('Task board was not created');
      return dto(record);
    }
    const record = await this.model
      .findOneAndUpdate(
        { workspace: workspaceId, project: projectId, version },
        { $set: { tasks: entries, version: version + 1 } },
        {
          session: this.session ?? null,
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .lean();
    return record ? dto(record) : null;
  }
}
