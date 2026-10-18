import type { ClientSession, Connection } from 'mongoose';
import type {
  ProposalDecisionTransactions,
  DecisionTransactionContext,
  ProposalProjectCreator,
} from '../application/ports/proposal-decision-store.js';
import type { ProposalModel } from './proposal-model.js';
import { MongoProposalDecisionStore } from './mongo-proposal-decision-store.js';
export class MongoProposalDecisionTransactions implements ProposalDecisionTransactions {
  constructor(
    private readonly database: Connection,
    private readonly model: ProposalModel,
    private readonly projects: (
      session: ClientSession,
    ) => ProposalProjectCreator,
  ) {}
  async execute<T>(
    action: (context: DecisionTransactionContext) => Promise<T>,
  ): Promise<T> {
    const session = await this.database.startSession();
    try {
      return await session.withTransaction(
        () =>
          action({
            proposals: new MongoProposalDecisionStore(this.model, session),
            projects: this.projects(session),
          }),
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 10_000,
          maxCommitTimeMS: 5000,
        },
      );
    } finally {
      await session.endSession();
    }
  }
}
