import type { ListOrder } from '../../../shared/domain/list-order.js';
import type { ClientSession, InferSchemaType } from 'mongoose';
import type { ProposalStore } from '../application/ports/proposal-store.js';
import type {
  DraftContent,
  Proposal,
  ProposalClient,
  ProposalSummary,
} from '../domain/proposal.js';
import { validateCurrency } from '../../../shared/domain/money.js';
import type { ProposalModel } from './proposal-model.js';
type StoredProposal = InferSchemaType<ProposalModel['schema']> & {
  _id: { toString(): string };
};
function toSummary(record: StoredProposal): ProposalSummary {
  return {
    id: record._id.toString(),
    title: record.title,
    client: {
      id: record.client.id.toString(),
      name: record.client.name,
      email: record.client.email,
      phone: record.client.phone ?? '',
      company: record.client.company ?? '',
    },
    currency: validateCurrency(record.currency),
    status: record.status,
    totalMinor: record.totalMinor,
    itemCount: record.itemCount,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
export function toProposal(record: StoredProposal): Proposal {
  return {
    ...toSummary(record),
    decision: record.decision
      ? { outcome: record.decision.outcome, at: record.decision.at }
      : null,
    projectId: record.decision?.project?.toString() ?? null,
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
function document(content: DraftContent, client: ProposalClient) {
  return {
    title: content.title,
    summary: content.summary,
    terms: content.terms,
    currency: content.currency,
    items: content.items,
    itemCount: content.itemCount,
    totalMinor: content.totalMinor,
    client,
  };
}
export class MongoProposalStore implements ProposalStore {
  constructor(
    private readonly model: ProposalModel,
    private readonly session?: ClientSession,
  ) {}
  async create(
    workspaceId: string,
    content: DraftContent,
    client: ProposalClient,
  ) {
    const records = await this.model.create(
      [{ workspace: workspaceId, ...document(content, client) }],
      this.session ? { session: this.session } : {},
    );
    const record = records[0];
    if (!record) throw new Error('Proposal was not created');
    return toProposal(record);
  }
  async find(workspaceId: string, id: string) {
    const record = await this.model
      .findOne({ workspace: workspaceId, _id: id })
      .session(this.session ?? null)
      .lean();
    return record ? toProposal(record) : null;
  }
  async list(
    workspaceId: string,
    cursor?: string,
    order: ListOrder = 'newest',
  ) {
    const records = await this.model
      .find({
        workspace: workspaceId,
        ...(cursor
          ? { _id: order === 'oldest' ? { $gt: cursor } : { $lt: cursor } }
          : {}),
      })
      .select(
        'title client currency status totalMinor itemCount version createdAt updatedAt',
      )
      .sort({ _id: order === 'oldest' ? 1 : -1 })
      .limit(26)
      .maxTimeMS(3000)
      .lean();
    const items = records.slice(0, 25).map(toSummary);
    return {
      items,
      nextCursor: records.length > 25 ? (items.at(-1)?.id ?? null) : null,
    };
  }
  async updateDraft(
    workspaceId: string,
    id: string,
    version: number,
    content: DraftContent,
    client: ProposalClient,
  ) {
    const record = await this.model
      .findOneAndUpdate(
        { workspace: workspaceId, _id: id, version, status: 'draft' },
        { $set: document(content, client), $inc: { version: 1 } },
        {
          returnDocument: 'after',
          runValidators: true,
          ...(this.session ? { session: this.session } : {}),
        },
      )
      .lean();
    return record ? toProposal(record) : null;
  }
}
