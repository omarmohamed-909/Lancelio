import { validateListOrder } from '../../../shared/domain/list-order.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  validateId,
  validateVersion,
} from '../../../shared/domain/identifiers.js';
import { validateDraft } from '../domain/proposal.js';
import type { DraftInput, Proposal } from '../domain/proposal.js';
import type {
  ProposalStore,
  ProposalTransactions,
} from './ports/proposal-store.js';
export class ManageProposals {
  constructor(
    private readonly store: ProposalStore,
    private readonly transactions: ProposalTransactions,
  ) {}
  create(workspaceId: string, input: DraftInput) {
    const scope = validateId(workspaceId);
    const content = validateDraft(input);
    return this.transactions.execute(async ({ proposals, clients }) => {
      const client = await clients.reserve(scope, content.clientId, false);
      if (!client)
        throw new ApplicationError(
          'PROPOSAL_CLIENT_UNAVAILABLE',
          'Choose an active client from this workspace',
        );
      return proposals.create(scope, content, client);
    });
  }
  list(workspaceId: string, cursor?: string, order?: string) {
    return this.store.list(
      validateId(workspaceId),
      cursor === undefined ? undefined : validateId(cursor),
      validateListOrder(order),
    );
  }
  async read(workspaceId: string, id: string): Promise<Proposal> {
    const proposal = await this.store.find(
      validateId(workspaceId),
      validateId(id),
    );
    if (!proposal)
      throw new ApplicationError('PROPOSAL_NOT_FOUND', 'Proposal not found');
    return proposal;
  }
  update(workspaceId: string, id: string, version: number, input: DraftInput) {
    const scope = validateId(workspaceId);
    const proposalId = validateId(id);
    validateVersion(version);
    const content = validateDraft(input);
    return this.transactions.execute(async ({ proposals, clients }) => {
      const current = await proposals.find(scope, proposalId);
      if (!current)
        throw new ApplicationError('PROPOSAL_NOT_FOUND', 'Proposal not found');
      if (current.status !== 'draft')
        throw new ApplicationError(
          'PROPOSAL_LOCKED',
          'Only draft proposals can be changed',
        );
      if (current.version !== version)
        throw new ApplicationError(
          'PROPOSAL_CONFLICT',
          'Proposal changed; reload before saving',
        );
      const client = await clients.reserve(
        scope,
        content.clientId,
        current.client.id === content.clientId,
      );
      if (!client)
        throw new ApplicationError(
          'PROPOSAL_CLIENT_UNAVAILABLE',
          'Choose an active client from this workspace',
        );
      const result = await proposals.updateDraft(
        scope,
        proposalId,
        version,
        content,
        client,
      );
      if (!result)
        throw new ApplicationError(
          'PROPOSAL_CONFLICT',
          'Proposal changed; reload before saving',
        );
      return result;
    });
  }
}
