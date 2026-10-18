import { proposalDecisionSchema } from './proposal-decision';
import { z } from 'zod';
export { draftSchema } from '../../../shared/schemas/priced-document';
export type { DraftInput } from '../../../shared/schemas/priced-document';
export const currencySchema = z.enum(['EGP', 'USD', 'EUR', 'SAR']);
export type Currency = z.infer<typeof currencySchema>;
export const proposalClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  company: z.string(),
});
export type ProposalClient = z.infer<typeof proposalClientSchema>;
export const itemSchema = z.object({
  title: z.string(),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative().safe(),
  totalMinor: z.number().int().nonnegative().safe(),
});
export const summarySchema = z.object({
  id: z.string(),
  title: z.string(),
  client: proposalClientSchema,
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']),
  currency: currencySchema,
  totalMinor: z.number().int().nonnegative().safe(),
  itemCount: z.number().int().positive(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const proposalSchema = summarySchema.extend({
  decision: proposalDecisionSchema.nullable(),
  projectId: z
    .string()
    .regex(/^[a-f0-9]{24}$/u)
    .nullable(),
  summary: z.string(),
  terms: z.string(),
  items: z.array(itemSchema),
});
export const pageSchema = z.object({
  items: z.array(summarySchema),
  nextCursor: z.string().nullable(),
});
export type Proposal = z.infer<typeof proposalSchema>;
export type ProposalSummary = z.infer<typeof summarySchema>;
export type ProposalPage = z.infer<typeof pageSchema>;
