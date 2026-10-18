import { Types, mongo } from 'mongoose';
import type { Connection, InferSchemaType } from 'mongoose';
import type { PortalModel } from './portal-model.js';
import type { PortalStore } from '../application/ports/portal-store.js';
import type {
  PortalOwnerRecord,
  PortalPage,
  PortalCursors,
} from '../domain/client-portal.js';
import { visibleProgress } from '../domain/client-portal.js';
import type { PublicGrant } from '../../../shared/domain/public-grant.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateCurrency } from '../../../shared/domain/money.js';
export interface PortalCollections {
  clients: string;
  workspaces: string;
  projects: string;
  invoices: string;
  tasks: string;
  payments: string;
}
interface ClientRow extends mongo.Document {
  _id: Types.ObjectId;
  name: string;
  company?: string;
  archivedAt?: Date | null;
}
interface ProjectRow extends mongo.Document {
  _id: Types.ObjectId;
  title: string;
  summary: string;
  status: PortalPage['projects'][number]['status'];
}
interface InvoiceRow extends mongo.Document {
  _id: Types.ObjectId;
  number: string;
  title: string;
  currency: string;
  totalMinor: number;
  issuedAt: Date;
}
interface TaskRow extends mongo.Document {
  tasks: {
    title: string;
    description: string;
    status: 'todo' | 'in_progress' | 'done';
    clientVisible?: boolean;
  }[];
}
function owner(
  client: ClientRow,
  grant: InferSchemaType<PortalModel['schema']> | null,
): PortalOwnerRecord {
  return {
    client: {
      id: String(client._id),
      name: client.name,
      company: client.company ?? '',
      archived: client.archivedAt != null,
    },
    version: grant?.version ?? 0,
    share: grant
      ? {
          issuedAt: grant.issuedAt,
          expiresAt: grant.expiresAt,
          revokedAt: grant.revokedAt ?? null,
        }
      : null,
  };
}
export class MongoPortalStore implements PortalStore {
  constructor(
    private readonly database: Connection,
    private readonly grants: PortalModel,
    private readonly names: PortalCollections,
  ) {}
  private clients() {
    return this.database.collection<ClientRow>(this.names.clients);
  }
  private client(
    workspaceId: string,
    clientId: string,
    session?: mongo.ClientSession,
  ) {
    return this.clients().findOne(
      {
        workspace: new Types.ObjectId(workspaceId),
        _id: new Types.ObjectId(clientId),
      },
      {
        projection: { name: 1, company: 1, archivedAt: 1 },
        maxTimeMS: 3000,
        ...(session ? { session } : {}),
      },
    );
  }
  async find(workspaceId: string, clientId: string) {
    const client = await this.client(workspaceId, clientId);
    if (!client) return null;
    const grant = await this.grants
      .findOne({ workspace: workspaceId, client: clientId })
      .select('-digest')
      .maxTimeMS(3000)
      .lean();
    return owner(client, grant);
  }
  async issue(
    workspaceId: string,
    clientId: string,
    version: number,
    grant: PublicGrant & { digest: string },
  ) {
    const session = await this.database.startSession();
    try {
      return await session.withTransaction(async () => {
        const client = await this.clients().findOneAndUpdate(
          {
            workspace: new Types.ObjectId(workspaceId),
            _id: new Types.ObjectId(clientId),
            archivedAt: null,
          },
          { $inc: { referenceRevision: 1 } },
          {
            returnDocument: 'after',
            projection: { name: 1, company: 1, archivedAt: 1 },
            session,
            maxTimeMS: 3000,
          },
        );
        if (!client)
          throw new ApplicationError(
            'CLIENT_ARCHIVED',
            'Client is unavailable for sharing',
          );
        if (version === 0) {
          if (
            await this.grants
              .exists({ workspace: workspaceId, client: clientId })
              .session(session)
          )
            throw new ApplicationError('PORTAL_CONFLICT', 'Portal changed');
          const rows = await this.grants.create(
            [
              {
                workspace: workspaceId,
                client: clientId,
                version: 1,
                ...grant,
              },
            ],
            { session },
          );
          const created = rows[0];
          if (!created) throw new Error('Missing portal grant');
          return owner(client, created.toObject());
        }
        const saved = await this.grants
          .findOneAndUpdate(
            { workspace: workspaceId, client: clientId, version },
            { $set: grant, $inc: { version: 1 } },
            { session, returnDocument: 'after', runValidators: true },
          )
          .maxTimeMS(3000)
          .lean();
        if (!saved)
          throw new ApplicationError('PORTAL_CONFLICT', 'Portal changed');
        return owner(client, saved);
      });
    } catch (error: unknown) {
      if (error instanceof mongo.MongoServerError && error.code === 11000)
        return null;
      throw error;
    } finally {
      await session.endSession();
    }
  }
  async revoke(
    workspaceId: string,
    clientId: string,
    version: number,
    now: Date,
  ) {
    const client = await this.client(workspaceId, clientId);
    if (!client) return null;
    const grant = await this.grants
      .findOneAndUpdate(
        {
          workspace: workspaceId,
          client: clientId,
          version,
          digest: { $type: 'string' },
        },
        { $set: { digest: null, revokedAt: now }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .maxTimeMS(3000)
      .lean();
    return grant ? owner(client, grant) : null;
  }
  async preview(
    workspaceId: string,
    clientId: string,
    now: Date,
    cursors: PortalCursors,
  ) {
    const session = await this.database.startSession();
    try {
      return await session.withTransaction(
        async () => {
          const client = await this.client(workspaceId, clientId, session);
          return client
            ? this.page(workspaceId, client, now, cursors, session)
            : null;
        },
        { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
      );
    } finally {
      await session.endSession();
    }
  }
  async findPublic(digest: string, now: Date, cursors: PortalCursors) {
    const session = await this.database.startSession();
    try {
      return await session.withTransaction(
        async () => {
          const grant = await this.grants
            .findOne({ digest, revokedAt: null, expiresAt: { $gt: now } })
            .session(session)
            .maxTimeMS(3000)
            .lean();
          if (!grant) return null;
          const client = await this.client(
            String(grant.workspace),
            String(grant.client),
            session,
          );
          if (!client || client.archivedAt != null) return null;
          const page = await this.page(
            String(grant.workspace),
            client,
            now,
            cursors,
            session,
          );
          return page ? { ...page, expiresAt: grant.expiresAt } : null;
        },
        { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
      );
    } finally {
      await session.endSession();
    }
  }
  private async page(
    workspaceId: string,
    client: ClientRow,
    now: Date,
    cursors: PortalCursors,
    session: mongo.ClientSession,
  ): Promise<PortalPage | null> {
    const workspace = new Types.ObjectId(workspaceId),
      filter = { workspace, 'client.id': client._id },
      options = { session, maxTimeMS: 3000 };
    const sender = await this.database
      .collection<{ name: string }>(this.names.workspaces)
      .findOne({ _id: workspace }, { ...options, projection: { name: 1 } });
    if (!sender) return null;
    const projectRows = await this.database
      .collection<ProjectRow>(this.names.projects)
      .find(
        {
          ...filter,
          ...(cursors.projects
            ? { _id: { $lt: new Types.ObjectId(cursors.projects) } }
            : {}),
        },
        { ...options, projection: { title: 1, summary: 1, status: 1 } },
      )
      .sort({ _id: -1 })
      .limit(6)
      .toArray();
    const projects: PortalPage['projects'] = [];
    for (const row of projectRows.slice(0, 5)) {
      const board = await this.database
        .collection<TaskRow>(this.names.tasks)
        .findOne(
          { workspace, project: row._id },
          {
            ...options,
            projection: {
              'tasks.title': 1,
              'tasks.description': 1,
              'tasks.status': 1,
              'tasks.clientVisible': 1,
            },
          },
        );
      const tasks = (board?.tasks ?? [])
        .filter((task) => task.clientVisible === true)
        .map(({ title, description, status }) => ({
          title,
          description,
          status,
        }));
      projects.push({
        title: row.title,
        summary: row.summary ?? '',
        status: row.status,
        tasks,
        progress: visibleProgress(tasks),
      });
    }
    const invoiceRows = await this.database
      .collection<InvoiceRow>(this.names.invoices)
      .find(
        {
          ...filter,
          status: 'issued',
          ...(cursors.invoices
            ? { _id: { $lt: new Types.ObjectId(cursors.invoices) } }
            : {}),
        },
        {
          ...options,
          projection: {
            number: 1,
            title: 1,
            currency: 1,
            totalMinor: 1,
            issuedAt: 1,
          },
        },
      )
      .sort({ _id: -1 })
      .limit(6)
      .toArray();
    const invoices: PortalPage['invoices'] = [];
    for (const row of invoiceRows.slice(0, 5)) {
      const ledger = await this.database
        .collection<{
          entries: { amountMinor: number; voidedAt?: Date | null }[];
        }>(this.names.payments)
        .findOne(
          { workspace, invoice: row._id },
          {
            ...options,
            projection: { 'entries.amountMinor': 1, 'entries.voidedAt': 1 },
          },
        );
      const paid = (ledger?.entries ?? [])
          .filter((entry) => entry.voidedAt == null)
          .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n),
        remaining = BigInt(row.totalMinor) - paid;
      if (remaining < 0n) throw new Error('Invalid portal balance');
      invoices.push({
        number: row.number,
        title: row.title,
        currency: validateCurrency(row.currency),
        totalMinor: row.totalMinor,
        paidMinor: Number(paid),
        remainingMinor: Number(remaining),
        paymentStatus:
          remaining === 0n ? 'paid' : paid === 0n ? 'unpaid' : 'partially_paid',
        issuedAt: row.issuedAt,
      });
    }
    return {
      client: { name: client.name, company: client.company ?? '' },
      workspaceName: sender.name,
      asOf: now,
      projects,
      invoices,
      nextProjectCursor:
        projectRows.length > 5 ? String(projectRows[4]!._id) : null,
      nextInvoiceCursor:
        invoiceRows.length > 5 ? String(invoiceRows[4]!._id) : null,
    };
  }
}
