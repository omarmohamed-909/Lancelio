import type { ProposalDecision } from './proposal-decision.js';
export {
  grantExpiry,
  grantState,
} from '../../../shared/domain/public-grant.js';
import type { PricedItem, ProposalStatus } from './proposal.js';
import type { Currency } from '../../../shared/domain/money.js';
export interface ProposalGrant {
  allowResponse: boolean;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
export interface NewProposalGrant extends ProposalGrant {
  digest: string;
  senderName: string;
}
export interface ProposalShareState {
  proposalVersion: number;
  proposalStatus: ProposalStatus;
  updatedAt: Date;
  share: (ProposalGrant & { state: 'active' | 'expired' | 'revoked' }) | null;
}
export interface PublicProposal {
  title: string;
  summary: string;
  terms: string;
  currency: Currency;
  items: PricedItem[];
  totalMinor: number;
  status: 'sent' | 'accepted' | 'rejected';
  canRespond: boolean;
  decision: ProposalDecision | null;
  client: { name: string; company: string };
  senderName: string;
  issuedAt: Date;
  expiresAt: Date;
}
