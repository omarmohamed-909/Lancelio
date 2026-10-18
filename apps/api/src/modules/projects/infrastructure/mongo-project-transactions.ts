import type { ClientSession, Connection } from 'mongoose';
import type {
  ProjectClientDirectory,
  ProjectTransactionContext,
  ProjectTransactions,
} from '../application/ports/project-store.js';
import type { ProjectModel } from './project-model.js';
import { MongoProjectStore } from './mongo-project-store.js';
export class MongoProjectTransactions implements ProjectTransactions {
  constructor(
    private readonly database: Connection,
    private readonly model: ProjectModel,
    private readonly clients: (
      session: ClientSession,
    ) => ProjectClientDirectory,
  ) {}
  async execute<T>(
    action: (context: ProjectTransactionContext) => Promise<T>,
  ): Promise<T> {
    const session = await this.database.startSession();
    try {
      return await session.withTransaction(
        () =>
          action({
            projects: new MongoProjectStore(this.model, session),
            clients: this.clients(session),
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
