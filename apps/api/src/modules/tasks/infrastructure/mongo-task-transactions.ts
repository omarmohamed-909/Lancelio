import type { ClientSession, Connection } from 'mongoose';
import type {
  TaskProjectDirectory,
  TaskTransactionContext,
  TaskTransactions,
} from '../application/ports/task-board-store.js';
import type { TaskBoardModel } from './task-board-model.js';
import { MongoTaskBoardStore } from './mongo-task-board-store.js';
export class MongoTaskTransactions implements TaskTransactions {
  constructor(
    private readonly database: Connection,
    private readonly model: TaskBoardModel,
    private readonly projects: (session: ClientSession) => TaskProjectDirectory,
  ) {}
  async execute<T>(
    action: (context: TaskTransactionContext) => Promise<T>,
  ): Promise<T> {
    const session = await this.database.startSession();
    try {
      return await session.withTransaction(
        () =>
          action({
            boards: new MongoTaskBoardStore(this.model, session),
            projects: this.projects(session),
          }),
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 10000,
          maxCommitTimeMS: 5000,
        },
      );
    } finally {
      await session.endSession();
    }
  }
}
