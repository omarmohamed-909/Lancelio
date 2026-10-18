import type { Proposal } from '../../domain/proposal.js';
import type {
  NewProposalGrant,
  ProposalGrant,
  PublicProposal,
} from '../../domain/proposal-share.js';
export interface SharedProposalRecord {
  proposal: Proposal;
  grant: ProposalGrant | null;
}
export interface ProposalShareStore {
  find(workspaceId: string, id: string): Promise<SharedProposalRecord | null>;
  issue(
    workspaceId: string,
    id: string,
    version: number,
    grant: NewProposalGrant,
  ): Promise<SharedProposalRecord | null>;
  revoke(
    workspaceId: string,
    id: string,
    version: number,
    now: Date,
  ): Promise<SharedProposalRecord | null>;
  findPublic(digest: string, now: Date): Promise<PublicProposal | null>;
}
export interface ProposalShareTokens {
  generate(): { token: string; digest: string };
  digest(token: string): string;
}
