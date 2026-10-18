import { Types } from 'mongoose';
import type { Connection, mongo } from 'mongoose';
import type {
  Notification,
  NotificationCursor,
} from '../domain/notification.js';
import type { NotificationStore } from '../application/ports/notification-store.js';
import type { NotificationStateModel } from './notification-state-model.js';
export interface NotificationCollections {
  proposals: string;
  invoices: string;
  payments: string;
}
export class MongoNotificationStore implements NotificationStore {
  constructor(
    private readonly database: Connection,
    private readonly states: NotificationStateModel,
    private readonly names: NotificationCollections,
  ) {}
  private collection(name: string) {
    if (!this.database.db) throw new Error('Database unavailable');
    return this.database.db.collection(name);
  }
  private sources(workspaceId: string, userId: string, eventId?: string) {
    const workspace = new Types.ObjectId(workspaceId),
      user = new Types.ObjectId(userId);
    const parts = eventId?.split(':');
    const target = parts?.[1] ? new Types.ObjectId(parts[1]) : null;
    const entry =
      parts?.[0] === 'payment' && parts[2]
        ? new Types.ObjectId(parts[2])
        : null;
    const documentScope = { workspace, ...(target ? { _id: target } : {}) };
    const invoices: mongo.Document[] = [
      {
        $match: {
          ...documentScope,
          status: 'issued',
          issuedAt: { $type: 'date' },
        },
      },
      {
        $project: {
          _id: 0,
          id: { $concat: ['invoice:', { $toString: '$_id' }, ':issued'] },
          kind: { $literal: 'invoice_issued' },
          title: '$title',
          occurredAt: '$issuedAt',
          target: { type: { $literal: 'invoice' }, id: { $toString: '$_id' } },
        },
      },
    ];
    const payments = (voided: boolean): mongo.Document[] => [
      { $match: { workspace, ...(target ? { invoice: target } : {}) } },
      {
        $lookup: {
          from: this.names.invoices,
          let: { invoiceId: '$invoice' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$invoiceId'] },
                    { $eq: ['$workspace', workspace] },
                    { $eq: ['$status', 'issued'] },
                  ],
                },
              },
            },
            { $project: { _id: 1, title: 1 } },
          ],
          as: 'invoiceDoc',
        },
      },
      { $unwind: '$invoiceDoc' },
      { $unwind: '$entries' },
      {
        $match: {
          ...(entry ? { 'entries._id': entry } : {}),
          [voided ? 'entries.voidedAt' : 'entries.createdAt']: {
            $type: 'date',
          },
        },
      },
      {
        $project: {
          _id: 0,
          id: {
            $concat: [
              'payment:',
              { $toString: '$invoice' },
              ':',
              { $toString: '$entries._id' },
              voided ? ':voided' : ':received',
            ],
          },
          kind: { $literal: voided ? 'payment_voided' : 'payment_received' },
          title: '$invoiceDoc.title',
          occurredAt: voided ? '$entries.voidedAt' : '$entries.createdAt',
          target: {
            type: { $literal: 'invoice' },
            id: { $toString: '$invoice' },
          },
        },
      },
    ];
    const proposals: mongo.Document[] = [
      {
        $match: {
          ...documentScope,
          'decision.outcome': { $in: ['accepted', 'rejected'] },
          'decision.at': { $type: 'date' },
          $expr: { $eq: ['$status', '$decision.outcome'] },
        },
      },
      {
        $project: {
          _id: 0,
          id: {
            $concat: [
              'proposal:',
              { $toString: '$_id' },
              ':',
              '$decision.outcome',
            ],
          },
          kind: { $concat: ['proposal_', '$decision.outcome'] },
          title: '$title',
          occurredAt: '$decision.at',
          target: { type: { $literal: 'proposal' }, id: { $toString: '$_id' } },
        },
      },
    ];
    const state: mongo.Document[] = [
      {
        $lookup: {
          from: this.states.collection.name,
          let: { event: '$id' },
          pipeline: [
            {
              $match: {
                workspace,
                user,
                $expr: { $eq: ['$eventId', '$$event'] },
              },
            },
            { $project: { _id: 0, read: 1, readAt: 1, version: 1 } },
          ],
          as: 'state',
        },
      },
      {
        $set: {
          read: { $ifNull: [{ $arrayElemAt: ['$state.read', 0] }, false] },
          readAt: { $ifNull: [{ $arrayElemAt: ['$state.readAt', 0] }, null] },
          version: { $ifNull: [{ $arrayElemAt: ['$state.version', 0] }, 0] },
        },
      },
      { $unset: 'state' },
    ];
    return [
      {
        name: this.names.proposals,
        prefix: 'proposal',
        pipeline: [...proposals, ...state],
      },
      {
        name: this.names.invoices,
        prefix: 'invoice',
        pipeline: [...invoices, ...state],
      },
      {
        name: this.names.payments,
        prefix: 'payment',
        suffix: 'received',
        pipeline: [...payments(false), ...state],
      },
      {
        name: this.names.payments,
        prefix: 'payment',
        suffix: 'voided',
        pipeline: [...payments(true), ...state],
      },
    ];
  }
  private async snapshot<T>(
    read: (session: mongo.ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.database.startSession();
    try {
      return (await session.withTransaction(() => read(session), {
        readConcern: { level: 'snapshot' },
        readPreference: 'primary',
      }))!;
    } finally {
      await session.endSession();
    }
  }
  list(
    workspace: string,
    user: string,
    unreadOnly: boolean,
    cursor: NotificationCursor | null,
  ) {
    return this.snapshot(async (session) => {
      const page: mongo.Document[] = [];
      if (unreadOnly) page.push({ $match: { read: false } });
      if (cursor)
        page.push({
          $match: {
            $or: [
              { occurredAt: { $lt: cursor.at } },
              { occurredAt: cursor.at, id: { $lt: cursor.id } },
            ],
          },
        });
      page.push({ $sort: { occurredAt: -1, id: -1 } }, { $limit: 26 });
      const items: Notification[] = [];
      let unreadCount = 0;
      // MongoDB does not support unionWith in transactions. Read each bounded
      // source sequentially in one snapshot, then merge the four ordered pages.
      for (const source of this.sources(workspace, user)) {
        const rows = await this.collection(source.name)
          .aggregate<{ items: Notification[]; unread: { count: number }[] }>(
            [
              ...source.pipeline,
              {
                $facet: {
                  items: page,
                  unread: [{ $match: { read: false } }, { $count: 'count' }],
                },
              },
            ],
            { session, maxTimeMS: 3000 },
          )
          .toArray();
        items.push(...(rows[0]?.items ?? []));
        unreadCount += rows[0]?.unread[0]?.count ?? 0;
      }
      items.sort(
        (left, right) =>
          right.occurredAt.getTime() - left.occurredAt.getTime() ||
          (left.id < right.id ? 1 : left.id > right.id ? -1 : 0),
      );
      const last = items[24];
      return {
        items: items.slice(0, 25),
        unreadCount,
        next:
          items.length > 25 && last
            ? { at: last.occurredAt, id: last.id }
            : null,
      };
    });
  }
  summary(workspace: string, user: string) {
    return this.snapshot(async (session) => {
      let count = 0;
      for (const source of this.sources(workspace, user)) {
        const rows = await this.collection(source.name)
          .aggregate<{ count: number }>(
            [
              ...source.pipeline,
              { $match: { read: false } },
              { $count: 'count' },
            ],
            { session, maxTimeMS: 3000 },
          )
          .toArray();
        count += rows[0]?.count ?? 0;
      }
      return count;
    });
  }
  async setRead(
    workspace: string,
    user: string,
    id: string,
    version: number,
    read: boolean,
    at: Date,
  ) {
    try {
      return await this.snapshot(async (session) => {
        const source = this.sources(workspace, user, id).find(
          (candidate) =>
            id.startsWith(candidate.prefix + ':') &&
            (!candidate.suffix || id.endsWith(':' + candidate.suffix)),
        );
        if (!source) return { status: 'missing' as const };
        const event = await this.collection(source.name)
          .aggregate<Notification>(
            [...source.pipeline, { $match: { id } }, { $limit: 1 }],
            { session, maxTimeMS: 3000 },
          )
          .next();
        if (!event) return { status: 'missing' as const };
        if (event.version !== version) return { status: 'conflict' as const };
        if (event.read === read)
          return {
            status: 'saved' as const,
            read,
            readAt: event.readAt,
            version,
          };
        const readAt = read ? at : null;
        if (version === 0) {
          await this.states.create(
            [{ workspace, user, eventId: id, read, readAt, version: 1 }],
            { session },
          );
        } else {
          const updated = await this.states
            .findOneAndUpdate(
              { workspace, user, eventId: id, version },
              { $set: { read, readAt }, $inc: { version: 1 } },
              { session, returnDocument: 'after' },
            )
            .maxTimeMS(3000)
            .lean();
          if (!updated) return { status: 'conflict' as const };
        }
        return { status: 'saved' as const, read, readAt, version: version + 1 };
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 11000
      )
        return { status: 'conflict' as const };
      throw error;
    }
  }
}
