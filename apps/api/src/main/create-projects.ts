import type { Connection } from 'mongoose';
import type { ClientModel } from '../modules/clients/infrastructure/client-model.js';
import { ManageProjects } from '../modules/projects/application/manage-projects.js';
import type { ProjectModel } from '../modules/projects/infrastructure/project-model.js';
import { MongoProjectStore } from '../modules/projects/infrastructure/mongo-project-store.js';
import { MongoProjectTransactions } from '../modules/projects/infrastructure/mongo-project-transactions.js';
export function createProjects(
  database: Connection,
  projectModel: ProjectModel,
  clientModel: ClientModel,
) {
  const transactions = new MongoProjectTransactions(
    database,
    projectModel,
    (session) => ({
      reserve: async (workspaceId, clientId) => {
        const client = await clientModel
          .findOneAndUpdate(
            { workspace: workspaceId, _id: clientId, archivedAt: null },
            { $inc: { referenceRevision: 1 } },
            { session, returnDocument: 'after', timestamps: false },
          )
          .lean();
        return client
          ? {
              id: client._id.toString(),
              name: client.name,
              company: client.company,
              email: client.email,
              phone: client.phone,
            }
          : null;
      },
    }),
  );
  return new ManageProjects(new MongoProjectStore(projectModel), transactions);
}
