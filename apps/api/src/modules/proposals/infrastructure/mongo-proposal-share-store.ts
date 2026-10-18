import type {
  ProposalShareStore,
  SharedProposalRecord,
} from '../application/ports/proposal-share-store.js';
import type {
  NewProposalGrant,
  PublicProposal,
} from '../domain/proposal-share.js';
import type { ProposalModel } from './proposal-model.js';
import { toProposal } from './mongo-proposal-store.js';
import { validateCurrency } from '../../../shared/domain/money.js';
type Record = Parameters<typeof toProposal>[0];
function owner(record: Record): SharedProposalRecord {
  return {
    proposal: toProposal(record),
    grant: record.share
      ? {
          allowResponse: record.share.allowResponse === true,
          issuedAt: record.share.issuedAt,
          expiresAt: record.share.expiresAt,
          revokedAt: record.share.revokedAt ?? null,
        }
      : null,
  };
}
export class MongoProposalShareStore implements ProposalShareStore {
  constructor(private readonly model: ProposalModel) {}
  async find(workspaceId: string, id: string) {
    const record = await this.model
      .findOne({ workspace: workspaceId, _id: id })
      .lean();
    return record ? owner(record) : null;
  }
  async issue(
    workspaceId: string,
    id: string,
    version: number,
    grant: NewProposalGrant,
  ) {
    // Content locking and grant replacement happen in the same document write.
    const record = await this.model
      .findOneAndUpdate(
        {
          workspace: workspaceId,
          _id: id,
          version,
          status: { $in: ['draft', 'sent'] },
        },
        { $set: { status: 'sent', share: grant }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();
    return record ? owner(record) : null;
  }
  async revoke(workspaceId: string, id: string, version: number, now: Date) {
    const record = await this.model
      .findOneAndUpdate(
        {
          workspace: workspaceId,
          _id: id,
          version,
          share: { $ne: null },
          'share.revokedAt': null,
        },
        {
          $set: { 'share.digest': null, 'share.revokedAt': now },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();
    return record ? owner(record) : null;
  }
  async findPublic(digest: string, now: Date): Promise<PublicProposal | null> {
    const record = await this.model
      .findOne({
        'share.digest': digest,
        'share.revokedAt': null,
        'share.expiresAt': { $gt: now },
        status: { $in: ['sent', 'accepted', 'rejected'] },
      })
      .select(
        'title summary terms currency items totalMinor status client.name client.company share.senderName share.issuedAt share.expiresAt share.allowResponse decision.outcome decision.at -_id',
      )
      .maxTimeMS(3000)
      .lean();
    if (
      !record?.share ||
      (record.status !== 'sent' &&
        record.status !== 'accepted' &&
        record.status !== 'rejected')
    )
      return null;
    return {
      title: record.title,
      summary: record.summary,
      terms: record.terms,
      currency: validateCurrency(record.currency),
      items: record.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        totalMinor: item.totalMinor,
      })),
      totalMinor: record.totalMinor,
      status: record.status,
      canRespond:
        record.status === 'sent' && record.share.allowResponse === true,
      decision: record.decision
        ? { outcome: record.decision.outcome, at: record.decision.at }
        : null,
      client: {
        name: record.client.name,
        company: record.client.company ?? '',
      },
      senderName: record.share.senderName,
      issuedAt: record.share.issuedAt,
      expiresAt: record.share.expiresAt,
    };
  }
}
