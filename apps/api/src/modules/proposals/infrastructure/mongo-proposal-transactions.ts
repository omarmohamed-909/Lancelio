import type { ClientSession, Connection } from 'mongoose';
import type {
  ProposalClientDirectory,
  ProposalTransactionContext,
  ProposalTransactions,
} from '../application/ports/proposal-store.js';
import type { ProposalModel } from './proposal-model.js';
import { MongoProposalStore } from './mongo-proposal-store.js';
export class MongoProposalTransactions implements ProposalTransactions {
  constructor(
    private readonly connection: Connection,
    private readonly model: ProposalModel,
    private readonly directory: (
      session: ClientSession,
    ) => ProposalClientDirectory,
  ) {}
  execute<T>(
    action: (context: ProposalTransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.connection.transaction((session) =>
      action({
        proposals: new MongoProposalStore(this.model, session),
        clients: this.directory(session),
      }),
    );
  }
}
