import type { Connection } from 'mongoose';
import type { ClientModel } from '../modules/clients/infrastructure/client-model.js';
import { ManageProposals } from '../modules/proposals/application/manage-proposals.js';
import type { ProposalModel } from '../modules/proposals/infrastructure/proposal-model.js';
import { MongoProposalStore } from '../modules/proposals/infrastructure/mongo-proposal-store.js';
import { MongoProposalTransactions } from '../modules/proposals/infrastructure/mongo-proposal-transactions.js';
export function createProposals(
  database: Connection,
  proposalModel: ProposalModel,
  clientModel: ClientModel,
) {
  const transactions = new MongoProposalTransactions(
    database,
    proposalModel,
    (session) => ({
      reserve: async (workspaceId, clientId, allowArchived) => {
        // Writing the client serializes the reference snapshot with contact edits and archive.
        const client = await clientModel
          .findOneAndUpdate(
            {
              workspace: workspaceId,
              _id: clientId,
              ...(allowArchived ? {} : { archivedAt: null }),
            },
            { $inc: { referenceRevision: 1 } },
            { session, returnDocument: 'after', timestamps: false },
          )
          .lean();
        return client
          ? {
              id: client._id.toString(),
              name: client.name,
              email: client.email,
              phone: client.phone,
              company: client.company,
            }
          : null;
      },
    }),
  );
  return new ManageProposals(
    new MongoProposalStore(proposalModel),
    transactions,
  );
}
