import { ApplicationError } from '../../../shared/domain/application-error.js';
export type DecisionChoice = 'accept' | 'reject';
export type DecisionOutcome = 'accepted' | 'rejected';
export interface ProposalDecision {
  outcome: DecisionOutcome;
  at: Date;
}
export interface StoredProposalDecision extends ProposalDecision {
  requestId: string;
  grantDigest: string;
  projectId: string | null;
}
export interface DecisionResult {
  status: DecisionOutcome;
  decidedAt: Date;
}
export function validateDecision(choice: string, requestId: string) {
  if (
    (choice !== 'accept' && choice !== 'reject') ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(
      requestId,
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid proposal decision');
  return {
    outcome:
      choice === 'accept' ? ('accepted' as const) : ('rejected' as const),
    requestId: requestId.toLowerCase(),
  };
}
