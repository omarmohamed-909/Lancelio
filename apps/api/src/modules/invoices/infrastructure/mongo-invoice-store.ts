import type { ListOrder } from '../../../shared/domain/list-order.js';
import type { ClientSession, InferSchemaType } from 'mongoose';
import { validateCurrency } from '../../../shared/domain/money.js';
import { invoiceNumber } from '../domain/invoice.js';
import type {
  Invoice,
  InvoiceClient,
  InvoiceProject,
  InvoiceContent,
} from '../domain/invoice.js';
import type { InvoiceStore } from '../application/ports/invoice-store.js';
import type { InvoiceModels } from './invoice-model.js';
type Stored = InferSchemaType<InvoiceModels['Invoice']['schema']> & {
  _id: { toString(): string };
};
function summary(record: Stored) {
  return {
    id: record._id.toString(),
    number: record.number,
    sequence: record.sequence,
    title: record.title,
    client: {
      id: record.client.id.toString(),
      name: record.client.name,
      email: record.client.email,
      phone: record.client.phone,
      company: record.client.company,
    },
    project: record.project
      ? {
          id: record.project.id.toString(),
          title: record.project.title,
          clientId: record.project.clientId.toString(),
        }
      : null,
    status: record.status,
    issuedAt: record.issuedAt ?? null,
    senderName: record.senderName ?? null,
    currency: validateCurrency(record.currency),
    totalMinor: record.totalMinor,
    itemCount: record.itemCount,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
export function toInvoice(record: Stored): Invoice {
  return {
    ...summary(record),
    summary: record.summary,
    terms: record.terms,
    items: record.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      totalMinor: item.totalMinor,
    })),
  };
}
export class MongoInvoiceStore implements InvoiceStore {
  constructor(
    private readonly model: InvoiceModels['Invoice'],
    private readonly session?: ClientSession,
  ) {}
  async find(workspaceId: string, id: string) {
    const row = await this.model
      .findOne({ workspace: workspaceId, _id: id })
      .session(this.session ?? null)
      .lean();
    return row ? toInvoice(row) : null;
  }
  async findRequest(workspaceId: string, requestId: string) {
    const row = await this.model
      .findOne({ workspace: workspaceId, requestId })
      .session(this.session ?? null)
      .lean();
    return row
      ? {
          invoice: toInvoice(row),
          fingerprint: row.creationFingerprint ?? null,
        }
      : null;
  }
  async preserveCreation(workspaceId: string, id: string, fingerprint: string) {
    await this.model.updateOne(
      { workspace: workspaceId, _id: id, creationFingerprint: null },
      { $set: { creationFingerprint: fingerprint } },
      { ...(this.session ? { session: this.session } : {}), timestamps: false },
    );
  }
  async updateDraft(
    workspaceId: string,
    id: string,
    version: number,
    content: InvoiceContent,
    client: InvoiceClient,
    project: InvoiceProject | null,
  ) {
    const row = await this.model
      .findOneAndUpdate(
        { workspace: workspaceId, _id: id, version, status: 'draft' },
        {
          $set: {
            title: content.title,
            summary: content.summary,
            terms: content.terms,
            currency: content.currency,
            items: content.items,
            itemCount: content.itemCount,
            totalMinor: content.totalMinor,
            client,
            project,
          },
          $inc: { version: 1 },
        },
        {
          ...(this.session ? { session: this.session } : {}),
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .lean();
    return row ? toInvoice(row) : null;
  }
  async issue(
    workspaceId: string,
    id: string,
    version: number,
    client: InvoiceClient,
    senderName: string,
    now: Date,
  ) {
    const row = await this.model
      .findOneAndUpdate(
        { workspace: workspaceId, _id: id, version, status: 'draft' },
        {
          $set: { status: 'issued', client, senderName, issuedAt: now },
          $inc: { version: 1 },
        },
        {
          ...(this.session ? { session: this.session } : {}),
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .lean();
    return row ? toInvoice(row) : null;
  }
  async list(
    workspaceId: string,
    cursor?: string,
    order: ListOrder = 'newest',
  ) {
    const rows = await this.model
      .find({
        workspace: workspaceId,
        ...(cursor
          ? { _id: order === 'oldest' ? { $gt: cursor } : { $lt: cursor } }
          : {}),
      })
      .select(
        'number sequence title client project status currency totalMinor itemCount version createdAt updatedAt issuedAt senderName',
      )
      .sort({ _id: order === 'oldest' ? 1 : -1 })
      .limit(26)
      .maxTimeMS(3000)
      .lean();
    const items = rows.slice(0, 25).map(summary);
    return {
      items,
      nextCursor: rows.length > 25 ? (items.at(-1)?.id ?? null) : null,
    };
  }
  async create(
    workspaceId: string,
    requestId: string,
    fingerprint: string,
    sequence: number,
    content: InvoiceContent,
    client: InvoiceClient,
    project: InvoiceProject | null,
  ) {
    const priced = {
      title: content.title,
      summary: content.summary,
      terms: content.terms,
      currency: content.currency,
      items: content.items,
      itemCount: content.itemCount,
      totalMinor: content.totalMinor,
    };
    const rows = await this.model.create(
      [
        {
          workspace: workspaceId,
          requestId,
          creationFingerprint: fingerprint,
          sequence,
          number: invoiceNumber(sequence),
          ...priced,
          client,
          project,
        },
      ],
      this.session ? { session: this.session } : {},
    );
    const row = rows[0];
    if (!row) throw Error('Invoice was not created');
    return toInvoice(row);
  }
}
