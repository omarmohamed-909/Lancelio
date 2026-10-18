import type { Connection } from 'mongoose';
import type { ProposalModel } from '../modules/proposals/infrastructure/proposal-model.js';
import type { ProjectModel } from '../modules/projects/infrastructure/project-model.js';
import { MongoProjectStore } from '../modules/projects/infrastructure/mongo-project-store.js';
import { ManageProjects } from '../modules/projects/application/manage-projects.js';
import { DecideProposal } from '../modules/proposals/application/decide-proposal.js';
import { MongoProposalDecisionTransactions } from '../modules/proposals/infrastructure/mongo-proposal-decision-transactions.js';
import { CryptoProposalShareTokens } from '../modules/proposals/infrastructure/proposal-share-tokens.js';
export function createProposalDecisions(
  database: Connection,
  proposalModel: ProposalModel,
  projectModel: ProjectModel,
  now: () => Date = () => new Date(),
) {
  const transactions = new MongoProposalDecisionTransactions(
    database,
    proposalModel,
    (session) => ({
      create: async (workspaceId, proposal, acceptedAt) => {
        const project = await new ManageProjects(
          new MongoProjectStore(projectModel, session),
        ).createAccepted({
          workspaceId,
          sourceProposalId: proposal.id,
          title: proposal.title,
          summary: proposal.summary,
          terms: proposal.terms,
          currency: proposal.currency,
          items: proposal.items.map((item) => ({ ...item })),
          totalMinor: proposal.totalMinor,
          client: { ...proposal.client },
          acceptedAt,
        });
        return project.id;
      },
    }),
  );
  return new DecideProposal(transactions, new CryptoProposalShareTokens(), now);
}
