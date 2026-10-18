import type { ClientSession } from 'mongoose';
import type {
  DecisionRecord,
  ProposalDecisionStore,
} from '../application/ports/proposal-decision-store.js';
import type { StoredProposalDecision } from '../domain/proposal-decision.js';
import type { ProposalModel } from './proposal-model.js';
import { toProposal } from './mongo-proposal-store.js';
export class MongoProposalDecisionStore implements ProposalDecisionStore {
  constructor(
    private readonly model: ProposalModel,
    private readonly session: ClientSession,
  ) {}
  async findGrant(digest: string, now: Date): Promise<DecisionRecord | null> {
    const record = await this.model
      .findOne({
        'share.digest': digest,
        'share.revokedAt': null,
        'share.expiresAt': { $gt: now },
        status: { $in: ['sent', 'accepted', 'rejected'] },
      })
      .session(this.session)
      .maxTimeMS(3000)
      .lean();
    return record
      ? {
          workspaceId: record.workspace.toString(),
          proposal: toProposal(record),
          allowResponse: record.share?.allowResponse === true,
          decision: record.decision
            ? {
                outcome: record.decision.outcome,
                at: record.decision.at,
                requestId: record.decision.requestId,
                grantDigest: record.decision.grantDigest,
                projectId: record.decision.project?.toString() ?? null,
              }
            : null,
        }
      : null;
  }
  async reserve(
    record: DecisionRecord,
    digest: string,
    decision: StoredProposalDecision,
  ) {
    const result = await this.model.updateOne(
      {
        _id: record.proposal.id,
        workspace: record.workspaceId,
        version: record.proposal.version,
        status: 'sent',
        decision: null,
        'share.digest': digest,
        'share.revokedAt': null,
        'share.allowResponse': true,
        'share.expiresAt': { $gt: decision.at },
      },
      {
        $set: {
          status: decision.outcome,
          decision: {
            requestId: decision.requestId,
            grantDigest: decision.grantDigest,
            outcome: decision.outcome,
            at: decision.at,
            project: null,
          },
        },
        $inc: { version: 1 },
      },
      { session: this.session, runValidators: true },
    );
    return result.modifiedCount === 1;
  }
  async linkProject(
    workspaceId: string,
    id: string,
    requestId: string,
    projectId: string,
  ) {
    const result = await this.model.updateOne(
      {
        _id: id,
        workspace: workspaceId,
        status: 'accepted',
        'decision.requestId': requestId,
        'decision.project': null,
      },
      { $set: { 'decision.project': projectId } },
      { session: this.session, runValidators: true, timestamps: false },
    );
    return result.modifiedCount === 1;
  }
}
