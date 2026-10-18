import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  validateId,
  validateVersion,
} from '../../../shared/domain/identifiers.js';
import { grantExpiry, grantState } from '../domain/proposal-share.js';
import type { ProposalShareState } from '../domain/proposal-share.js';
import type {
  ProposalShareStore,
  ProposalShareTokens,
  SharedProposalRecord,
} from './ports/proposal-share-store.js';
export class ShareProposals {
  constructor(
    private readonly store: ProposalShareStore,
    private readonly tokens: ProposalShareTokens,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private state(record: SharedProposalRecord, now: Date): ProposalShareState {
    return {
      proposalVersion: record.proposal.version,
      proposalStatus: record.proposal.status,
      updatedAt: record.proposal.updatedAt,
      share: record.grant
        ? { ...record.grant, state: grantState(record.grant, now) }
        : null,
    };
  }
  private async current(workspaceId: string, id: string, version?: number) {
    const scope = validateId(workspaceId);
    const proposalId = validateId(id);
    if (version !== undefined) validateVersion(version);
    const record = await this.store.find(scope, proposalId);
    if (!record)
      throw new ApplicationError('PROPOSAL_NOT_FOUND', 'Proposal not found');
    if (version !== undefined && record.proposal.version !== version)
      throw new ApplicationError(
        'PROPOSAL_CONFLICT',
        'Proposal changed; reload before sharing',
      );
    return { scope, proposalId, record };
  }
  async read(workspaceId: string, id: string) {
    const { record } = await this.current(workspaceId, id);
    return this.state(record, this.now());
  }
  async issue(
    workspaceId: string,
    senderName: string,
    id: string,
    version: number,
    days: number,
  ) {
    const now = this.now();
    const expiresAt = grantExpiry(days, now);
    const { scope, proposalId, record } = await this.current(
      workspaceId,
      id,
      version,
    );
    if (record.proposal.status !== 'draft' && record.proposal.status !== 'sent')
      throw new ApplicationError(
        'PROPOSAL_LOCKED',
        'This proposal cannot be shared again',
      );
    const secret = this.tokens.generate();
    const saved = await this.store.issue(scope, proposalId, version, {
      digest: secret.digest,
      senderName,
      allowResponse: true,
      issuedAt: now,
      expiresAt,
      revokedAt: null,
    });
    if (!saved)
      throw new ApplicationError(
        'PROPOSAL_CONFLICT',
        'Proposal changed; reload before sharing',
      );
    return { ...this.state(saved, now), token: secret.token };
  }
  async revoke(workspaceId: string, id: string, version: number) {
    const now = this.now();
    const { scope, proposalId, record } = await this.current(
      workspaceId,
      id,
      version,
    );
    if (!record.grant)
      throw new ApplicationError(
        'PROPOSAL_SHARE_UNAVAILABLE',
        'Sharing link is unavailable',
      );
    if (record.grant.revokedAt) return this.state(record, now);
    const saved = await this.store.revoke(scope, proposalId, version, now);
    if (!saved)
      throw new ApplicationError(
        'PROPOSAL_CONFLICT',
        'Proposal changed; reload before revoking',
      );
    return this.state(saved, now);
  }
  async readPublic(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
      throw new ApplicationError(
        'PROPOSAL_SHARE_UNAVAILABLE',
        'Sharing link is unavailable',
      );
    const now = this.now();
    const document = await this.store.findPublic(
      this.tokens.digest(token),
      now,
    );
    if (!document)
      throw new ApplicationError(
        'PROPOSAL_SHARE_UNAVAILABLE',
        'Sharing link is unavailable',
      );
    return {
      ...document,
      validForSeconds: Math.ceil(
        (document.expiresAt.getTime() - now.getTime()) / 1000,
      ),
    };
  }
}
