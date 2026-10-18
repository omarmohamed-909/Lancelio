import { proposalDecisionSchema } from './proposal-decision';
import { z } from 'zod';
import { currencySchema, itemSchema, summarySchema } from './proposal';
export const shareStateSchema = z.object({
  proposalVersion: z.number().int().positive(),
  proposalStatus: summarySchema.shape.status,
  updatedAt: z.string().datetime(),
  share: z
    .object({
      allowResponse: z.boolean(),
      issuedAt: z.string().datetime(),
      expiresAt: z.string().datetime(),
      revokedAt: z.string().datetime().nullable(),
      state: z.enum(['active', 'expired', 'revoked']),
    })
    .nullable(),
});
export const issuedShareSchema = shareStateSchema.extend({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});
export const publicProposalSchema = z.object({
  title: z.string(),
  summary: z.string(),
  terms: z.string(),
  currency: currencySchema,
  items: z.array(itemSchema),
  totalMinor: z.number().int().nonnegative().safe(),
  status: z.enum(['sent', 'accepted', 'rejected']),
  canRespond: z.boolean(),
  decision: proposalDecisionSchema.nullable(),
  client: z.object({ name: z.string(), company: z.string() }),
  senderName: z.string(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  validForSeconds: z
    .number()
    .int()
    .positive()
    .max(30 * 86_400),
});
export type ProposalShareState = z.infer<typeof shareStateSchema>;
export type PublicProposal = z.infer<typeof publicProposalSchema>;
