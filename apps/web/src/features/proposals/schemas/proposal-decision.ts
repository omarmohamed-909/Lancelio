import { z } from 'zod';
export const proposalDecisionSchema = z.object({
  outcome: z.enum(['accepted', 'rejected']),
  at: z.string().datetime(),
});
export const decisionResultSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
  decidedAt: z.string().datetime(),
});
export type DecisionChoice = 'accept' | 'reject';
export interface DecisionAttempt {
  token: string;
  choice: DecisionChoice;
  requestId: string;
}
export type DecisionResult = z.infer<typeof decisionResultSchema>;
