import type { Proposal } from '../../domain/proposal.js';
import type { StoredProposalDecision } from '../../domain/proposal-decision.js';
export interface DecisionRecord {
  workspaceId: string;
  proposal: Proposal;
  decision: StoredProposalDecision | null;
  allowResponse: boolean;
}
export interface ProposalDecisionStore {
  findGrant(digest: string, now: Date): Promise<DecisionRecord | null>;
  reserve(
    record: DecisionRecord,
    digest: string,
    decision: StoredProposalDecision,
  ): Promise<boolean>;
  linkProject(
    workspaceId: string,
    id: string,
    requestId: string,
    projectId: string,
  ): Promise<boolean>;
}
export interface ProposalProjectCreator {
  create(
    workspaceId: string,
    proposal: Proposal,
    acceptedAt: Date,
  ): Promise<string>;
}
export interface DecisionTransactionContext {
  proposals: ProposalDecisionStore;
  projects: ProposalProjectCreator;
}
export interface ProposalDecisionTransactions {
  execute<T>(
    action: (context: DecisionTransactionContext) => Promise<T>,
  ): Promise<T>;
}
