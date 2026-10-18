import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateDecision } from '../domain/proposal-decision.js';
import type { DecisionResult } from '../domain/proposal-decision.js';
import type { ProposalDecisionTransactions } from './ports/proposal-decision-store.js';
import type { ProposalShareTokens } from './ports/proposal-share-store.js';
export class DecideProposal {
  constructor(
    private readonly transactions: ProposalDecisionTransactions,
    private readonly tokens: ProposalShareTokens,
    private readonly now: () => Date = () => new Date(),
  ) {}
  execute(
    token: string,
    choice: string,
    requestId: string,
  ): Promise<DecisionResult> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
      throw new ApplicationError(
        'PROPOSAL_SHARE_UNAVAILABLE',
        'Sharing link is unavailable',
      );
    const input = validateDecision(choice, requestId);
    const digest = this.tokens.digest(token);
    return this.transactions.execute(async ({ proposals, projects }) => {
      // A transaction retry rechecks current grant permission, expiry and state.
      const now = this.now();
      const record = await proposals.findGrant(digest, now);
      if (!record || !record.allowResponse)
        throw new ApplicationError(
          'PROPOSAL_SHARE_UNAVAILABLE',
          'Sharing link is unavailable',
        );
      if (record.decision) {
        if (
          record.decision.requestId === input.requestId &&
          record.decision.grantDigest === digest &&
          record.decision.outcome === input.outcome
        )
          return {
            status: record.decision.outcome,
            decidedAt: record.decision.at,
          };
        throw new ApplicationError(
          'PROPOSAL_DECISION_CONFLICT',
          'A final decision already exists',
        );
      }
      if (record.proposal.status !== 'sent')
        throw new ApplicationError(
          'PROPOSAL_DECISION_CONFLICT',
          'A final decision already exists',
        );
      const reserved = await proposals.reserve(record, digest, {
        ...input,
        grantDigest: digest,
        at: now,
        projectId: null,
      });
      if (!reserved)
        throw new ApplicationError(
          'PROPOSAL_DECISION_CONFLICT',
          'Proposal state changed',
        );
      // Reserve the proposal first: concurrent decisions contend before inserting projects.
      if (input.outcome === 'accepted') {
        const projectId = await projects.create(
          record.workspaceId,
          record.proposal,
          now,
        );
        if (
          !(await proposals.linkProject(
            record.workspaceId,
            record.proposal.id,
            input.requestId,
            projectId,
          ))
        )
          throw new Error('Accepted project could not be linked');
      }
      return { status: input.outcome, decidedAt: now };
    });
  }
}
