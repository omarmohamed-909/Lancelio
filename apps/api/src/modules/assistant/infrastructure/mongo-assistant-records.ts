import { Types } from 'mongoose';
import { exactMinor } from '../../../shared/domain/exact-minor.js';
import type { Connection, mongo } from 'mongoose';
import type { AssistantPlan, AssistantRecord } from '../domain/assistant.js';

export interface AssistantCollections {
  projects: string;
  invoices: string;
  payments: string;
}
export class MongoAssistantRecords {
  constructor(
    private readonly database: Connection,
    private readonly collections: AssistantCollections,
  ) {}
  async projects(scope: string, status: AssistantPlan['status']) {
    const rows = await this.database
      .collection(this.collections.projects)
      .find(
        {
          workspace: new Types.ObjectId(scope),
          ...(status === 'all'
            ? {}
            : {
                status:
                  status === 'open' ? { $in: ['active', 'on_hold'] } : status,
              }),
        },
        {
          projection: { title: 1, 'client.name': 1, status: 1 },
          maxTimeMS: 3000,
        },
      )
      .sort({ _id: -1 })
      .limit(7)
      .toArray();
    return {
      records: rows.slice(0, 6).map((row): AssistantRecord => ({
        kind: 'projects',
        id: String(row._id),
        title: String(row.title),
        subtitle: String(row.client.name),
        status: String(row.status),
        currency: null,
        amountMinor: null,
      })),
      hasMore: rows.length > 6,
    };
  }
  async receivables(scope: string) {
    const workspace = new Types.ObjectId(scope);
    const session = await this.database.startSession();
    try {
      return await session.withTransaction(
        async () => {
          const rows = await this.database
            .collection(this.collections.invoices)
            .aggregate<mongo.Document>(
              [
                { $match: { workspace, status: 'issued' } },
                {
                  $lookup: {
                    from: this.collections.payments,
                    let: { invoiceId: '$_id' },
                    pipeline: [
                      {
                        $match: {
                          workspace,
                          $expr: { $eq: ['$invoice', '$$invoiceId'] },
                        },
                      },
                      { $unwind: '$entries' },
                      { $match: { 'entries.voidedAt': null } },
                      {
                        $group: {
                          _id: null,
                          paid: {
                            $sum: { $toDecimal: '$entries.amountMinor' },
                          },
                        },
                      },
                    ],
                    as: 'ledger',
                  },
                },
                {
                  $set: {
                    remaining: {
                      $subtract: [
                        { $toDecimal: '$totalMinor' },
                        {
                          $ifNull: [
                            { $arrayElemAt: ['$ledger.paid', 0] },
                            { $toDecimal: 0 },
                          ],
                        },
                      ],
                    },
                  },
                },
                {
                  $match: { $expr: { $gt: ['$remaining', { $toDecimal: 0 }] } },
                },
                { $sort: { _id: -1 } },
                { $limit: 7 },
                {
                  $project: {
                    title: 1,
                    number: 1,
                    'client.name': 1,
                    currency: 1,
                    remaining: { $toString: '$remaining' },
                  },
                },
              ],
              { session, maxTimeMS: 3000 },
            )
            .toArray();
          return {
            records: rows.slice(0, 6).map((row): AssistantRecord => {
              const amountMinor = exactMinor(String(row.remaining));
              return {
                kind: 'invoices',
                id: String(row._id),
                title: String(row.title),
                subtitle: String(row.client.name) + ' · ' + String(row.number),
                status: 'outstanding',
                currency: String(row.currency),
                amountMinor,
              };
            }),
            hasMore: rows.length > 6,
          };
        },
        { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
      );
    } finally {
      await session.endSession();
    }
  }
}
