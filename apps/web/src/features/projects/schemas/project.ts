import { z } from 'zod';
import {
  currencySchema,
  itemSchema,
  proposalClientSchema,
} from '../../proposals/schemas/proposal';
export const projectStatusSchema = z.enum([
  'active',
  'on_hold',
  'completed',
  'cancelled',
]);
const common = {
  id: z.string(),
  title: z.string(),
  client: proposalClientSchema,
  status: projectStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
};
export const projectSummarySchema = z.object({
  ...common,
  origin: z.enum(['manual', 'proposal']),
  sourceProposalId: z.string().nullable(),
});
export const projectPageSchema = z.object({
  items: z.array(projectSummarySchema),
  nextCursor: z.string().nullable(),
});
export const projectSchema = z.discriminatedUnion('origin', [
  z.object({
    ...common,
    origin: z.literal('proposal'),
    sourceProposalId: z.string(),
    summary: z.string(),
    terms: z.string(),
    currency: currencySchema,
    items: z.array(itemSchema),
    totalMinor: z.number().int().nonnegative().safe(),
    acceptedAt: z.string().datetime(),
  }),
  z.object({
    ...common,
    origin: z.literal('manual'),
    sourceProposalId: z.null(),
    summary: z.string(),
    terms: z.literal(''),
    currency: z.null(),
    items: z.array(itemSchema).max(0),
    totalMinor: z.null(),
    acceptedAt: z.null(),
  }),
]);
export const manualProjectSchema = z.object({
  clientId: z.string().regex(/^[a-f0-9]{24}$/u, 'اختار عميل للمشروع.'),
  title: z
    .string()
    .trim()
    .refine(
      (value) =>
        Array.from(value).length >= 2 && Array.from(value).length <= 120,
      'اكتب اسم المشروع من حرفين إلى 120 حرف.',
    ),
  summary: z
    .string()
    .trim()
    .refine(
      (value) => Array.from(value).length <= 3000,
      'وصف المشروع طويل (حتى 3000 حرف).',
    ),
});
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectPage = z.infer<typeof projectPageSchema>;
export type ManualProjectInput = z.infer<typeof manualProjectSchema>;
