import type { ListOrder } from '../../../../shared/domain/list-order.js';
import type {
  DraftContent,
  Proposal,
  ProposalClient,
  ProposalPage,
} from '../../domain/proposal.js';
export interface ProposalStore {
  create(
    workspaceId: string,
    content: DraftContent,
    client: ProposalClient,
  ): Promise<Proposal>;
  find(workspaceId: string, id: string): Promise<Proposal | null>;
  list(
    workspaceId: string,
    cursor?: string,
    order?: ListOrder,
  ): Promise<ProposalPage>;
  updateDraft(
    workspaceId: string,
    id: string,
    version: number,
    content: DraftContent,
    client: ProposalClient,
  ): Promise<Proposal | null>;
}
export interface ProposalClientDirectory {
  reserve(
    workspaceId: string,
    clientId: string,
    allowArchived: boolean,
  ): Promise<ProposalClient | null>;
}
export interface ProposalTransactionContext {
  proposals: ProposalStore;
  clients: ProposalClientDirectory;
}
export interface ProposalTransactions {
  execute<T>(
    action: (context: ProposalTransactionContext) => Promise<T>,
  ): Promise<T>;
}
