import type { ProposalModel } from '../modules/proposals/infrastructure/proposal-model.js';
import { ShareProposals } from '../modules/proposals/application/share-proposals.js';
import { MongoProposalShareStore } from '../modules/proposals/infrastructure/mongo-proposal-share-store.js';
import { CryptoProposalShareTokens } from '../modules/proposals/infrastructure/proposal-share-tokens.js';
export function createProposalSharing(model: ProposalModel, now?: () => Date) {
  return new ShareProposals(
    new MongoProposalShareStore(model),
    new CryptoProposalShareTokens(),
    now,
  );
}
