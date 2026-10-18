import { exactMinor } from '../domain/exact-minor.js';
import { Types } from 'mongoose';
import type { Connection, mongo } from 'mongoose';
import type { WorkspaceOverviewReader } from '../application/read-workspace-overview.js';
import type { WorkspaceOverview } from '../domain/workspace-overview.js';
import { validateCurrency } from '../../../shared/domain/money.js';
export interface OverviewCollections {
  clients: string;
  proposals: string;
  projects: string;
  tasks: string;
  invoices: string;
  payments: string;
}
export class MongoWorkspaceOverview implements WorkspaceOverviewReader {
  constructor(
    private readonly database: Connection,
    private readonly collections: OverviewCollections,
  ) {}
  async read(workspaceId: string, now: Date): Promise<WorkspaceOverview> {
    const workspace = new Types.ObjectId(workspaceId);
    const session = await this.database.startSession();
    try {
      return await session.withTransaction(
        async () => {
          const group = async <T extends Record<string, number>>(
            collection: string,
            field: mongo.Document | string,
            initial: T,
          ): Promise<T> => {
            const rows = await this.aggregate<{ _id: string; count: number }>(
              collection,
              [
                { $match: { workspace } },
                { $group: { _id: field, count: { $sum: 1 } } },
              ],
              session,
            );
            for (const row of rows) {
              if (
                !Object.hasOwn(initial, row._id) ||
                !Number.isSafeInteger(row.count) ||
                row.count < 0
              )
                throw new Error('Invalid overview count');
              Object.assign(initial, { [row._id]: row.count });
            }
            return initial;
          };
          const clients = await group(
            this.collections.clients,
            {
              $cond: [
                { $eq: [{ $ifNull: ['$archivedAt', null] }, null] },
                'active',
                'archived',
              ],
            },
            { active: 0, archived: 0 },
          );
          const proposals = await group(
            this.collections.proposals,
            {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'sent'] },
                    { $ne: [{ $ifNull: ['$share.expiresAt', null] }, null] },
                    { $lte: ['$share.expiresAt', now] },
                  ],
                },
                'expired',
                '$status',
              ],
            },
            { draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0 },
          );
          const projects = await group(this.collections.projects, '$status', {
            active: 0,
            on_hold: 0,
            completed: 0,
            cancelled: 0,
          });
          const invoices = await group(this.collections.invoices, '$status', {
            draft: 0,
            issued: 0,
          });
          const tasks = { todo: 0, in_progress: 0, done: 0 };
          const taskRows = await this.aggregate<{ _id: string; count: number }>(
            this.collections.tasks,
            [
              { $match: { workspace } },
              {
                $lookup: {
                  from: this.collections.projects,
                  let: { project: '$project' },
                  pipeline: [
                    {
                      $match: {
                        workspace,
                        status: { $in: ['active', 'on_hold'] },
                        $expr: { $eq: ['$_id', '$$project'] },
                      },
                    },
                  ],
                  as: 'projectRecord',
                },
              },
              { $match: { 'projectRecord.0': { $exists: true } } },
              { $unwind: '$tasks' },
              { $group: { _id: '$tasks.status', count: { $sum: 1 } } },
            ],
            session,
          );
          for (const row of taskRows) {
            if (
              !Object.hasOwn(tasks, row._id) ||
              !Number.isSafeInteger(row.count) ||
              row.count < 0
            )
              throw new Error('Invalid task count');
            Object.assign(tasks, { [row._id]: row.count });
          }
          const finances = await this.aggregate<{
            _id: string;
            invoicedMinor: string;
          }>(
            this.collections.invoices,
            [
              { $match: { workspace, status: 'issued' } },
              {
                $group: {
                  _id: '$currency',
                  invoiced: { $sum: { $toDecimal: '$totalMinor' } },
                },
              },
              { $project: { invoicedMinor: { $toString: '$invoiced' } } },
            ],
            session,
          );
          const received = await this.aggregate<{
            _id: string;
            receivedMinor: string;
          }>(
            this.collections.payments,
            [
              { $match: { workspace } },
              {
                $lookup: {
                  from: this.collections.invoices,
                  localField: 'invoice',
                  foreignField: '_id',
                  pipeline: [
                    { $match: { workspace, status: 'issued' } },
                    { $project: { currency: 1 } },
                  ],
                  as: 'invoiceRecord',
                },
              },
              { $unwind: '$invoiceRecord' },
              { $unwind: '$entries' },
              { $match: { 'entries.voidedAt': null } },
              {
                $group: {
                  _id: '$invoiceRecord.currency',
                  received: { $sum: { $toDecimal: '$entries.amountMinor' } },
                },
              },
              { $project: { receivedMinor: { $toString: '$received' } } },
            ],
            session,
          );
          const money = finances
            .map((row) => {
              const invoicedMinor = exactMinor(row.invoicedMinor);
              const receivedMinor = exactMinor(
                received.find((paid) => paid._id === row._id)?.receivedMinor ??
                  '0',
              );
              const outstanding = BigInt(invoicedMinor) - BigInt(receivedMinor);
              if (outstanding < 0n) throw new Error('Invalid invoice balance');
              return {
                currency: validateCurrency(row._id),
                invoicedMinor,
                receivedMinor,
                outstandingMinor: String(outstanding),
              };
            })
            .sort(
              (a, b) =>
                ['EGP', 'USD', 'EUR', 'SAR'].indexOf(a.currency) -
                ['EGP', 'USD', 'EUR', 'SAR'].indexOf(b.currency),
            );
          const expiring = await this.aggregate<{
            _id: Types.ObjectId;
            title: string;
            expiresAt: Date;
          }>(
            this.collections.proposals,
            [
              {
                $match: {
                  workspace,
                  status: 'sent',
                  'share.revokedAt': null,
                  'share.digest': { $type: 'string' },
                  'share.expiresAt': { $gt: now },
                },
              },
              { $sort: { 'share.expiresAt': 1, _id: 1 } },
              { $limit: 5 },
              { $project: { title: 1, expiresAt: '$share.expiresAt' } },
            ],
            session,
          );
          return {
            asOf: now.toISOString(),
            clients,
            proposals,
            projects,
            tasks,
            invoices,
            finances: money,
            expiringProposals: expiring.map((row) => ({
              id: String(row._id),
              title: row.title,
              expiresAt: row.expiresAt.toISOString(),
            })),
          };
        },
        { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
      );
    } finally {
      await session.endSession();
    }
  }
  private aggregate<T extends mongo.Document>(
    name: string,
    pipeline: mongo.Document[],
    session: mongo.ClientSession,
  ) {
    return this.database
      .collection(name)
      .aggregate<T>(pipeline, { session, maxTimeMS: 3000 })
      .toArray();
  }
}
