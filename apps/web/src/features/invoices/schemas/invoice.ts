import { z } from 'zod';
import { currencySchema } from '../../../shared/schemas/priced-document';
const client = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  company: z.string(),
});
const item = z.object({
  title: z.string(),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative().safe(),
  totalMinor: z.number().int().nonnegative().safe(),
});
export const invoiceSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  sequence: z.number().int().positive().safe(),
  title: z.string(),
  client,
  project: z
    .object({ id: z.string(), title: z.string(), clientId: z.string() })
    .nullable(),
  status: z.enum(['draft', 'issued']),
  issuedAt: z.string().datetime().nullable(),
  senderName: z.string().nullable(),
  currency: currencySchema,
  totalMinor: z.number().int().nonnegative().safe(),
  itemCount: z.number().int().positive(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const invoiceSchema = invoiceSummarySchema.extend({
  summary: z.string(),
  terms: z.string(),
  items: z.array(item),
});
export const invoicePageSchema = z.object({
  items: z.array(invoiceSummarySchema),
  nextCursor: z.string().nullable(),
});
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoicePage = z.infer<typeof invoicePageSchema>;
