import { Types } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import type { ProjectModel } from '../modules/projects/infrastructure/project-model.js';
import { ManageTasks } from '../modules/tasks/application/manage-tasks.js';
import type { TaskProjectDirectory } from '../modules/tasks/application/ports/task-board-store.js';
import { validateTaskProjectStatus } from '../modules/tasks/domain/task-board.js';
import type { TaskBoardModel } from '../modules/tasks/infrastructure/task-board-model.js';
import { MongoTaskBoardStore } from '../modules/tasks/infrastructure/mongo-task-board-store.js';
import { MongoTaskTransactions } from '../modules/tasks/infrastructure/mongo-task-transactions.js';
export function createTasks(
  database: Connection,
  boardModel: TaskBoardModel,
  projectModel: ProjectModel,
  now: () => Date = () => new Date(),
) {
  const directory = (session?: ClientSession): TaskProjectDirectory => ({
    read: async (workspaceId, projectId) => {
      const project = await projectModel
        .findOne({ workspace: workspaceId, _id: projectId })
        .select('status')
        .session(session ?? null)
        .maxTimeMS(3000)
        .lean();
      return project ? validateTaskProjectStatus(project.status) : null;
    },
    reserve: async (workspaceId, projectId) => {
      const project = await projectModel
        .findOneAndUpdate(
          { workspace: workspaceId, _id: projectId },
          { $inc: { taskReferenceRevision: 1 } },
          {
            session: session ?? null,
            returnDocument: 'after',
            timestamps: false,
          },
        )
        .select('status')
        .lean();
      return project ? validateTaskProjectStatus(project.status) : null;
    },
  });
  return new ManageTasks(
    new MongoTaskBoardStore(boardModel),
    directory(),
    new MongoTaskTransactions(database, boardModel, (session) =>
      directory(session),
    ),
    () => new Types.ObjectId().toString(),
    now,
  );
}
