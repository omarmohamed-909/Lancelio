import { sha256 } from '../shared/infrastructure/crypto-grant-tokens.js';
import type { Connection } from 'mongoose';
import type { ClientModel } from '../modules/clients/infrastructure/client-model.js';
import type { ProjectModel } from '../modules/projects/infrastructure/project-model.js';
import type { InvoiceModels } from '../modules/invoices/infrastructure/invoice-model.js';
import { ManageInvoices } from '../modules/invoices/application/manage-invoices.js';
import { MongoInvoiceStore } from '../modules/invoices/infrastructure/mongo-invoice-store.js';
import { MongoInvoiceTransactions } from '../modules/invoices/infrastructure/mongo-invoice-transactions.js';
export function createInvoices(
  database: Connection,
  models: InvoiceModels,
  clients: ClientModel,
  projects: ProjectModel,
  now?: () => Date,
) {
  return new ManageInvoices(
    new MongoInvoiceStore(models.Invoice),
    new MongoInvoiceTransactions(database, models, (session) => ({
      reserveClient: async (workspaceId, clientId, allowArchived) => {
        const row = await clients
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
        return row
          ? {
              id: row._id.toString(),
              name: row.name,
              email: row.email,
              phone: row.phone,
              company: row.company,
            }
          : null;
      },
      // Project identity and client association are immutable through the application API.
      findProject: async (workspaceId, projectId) => {
        const row = await projects
          .findOne({ workspace: workspaceId, _id: projectId })
          .session(session)
          .lean();
        return row
          ? {
              id: row._id.toString(),
              title: row.title,
              clientId: row.client.id.toString(),
            }
          : null;
      },
    })),
    { digest: sha256 },
    now,
  );
}
