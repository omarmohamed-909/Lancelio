import { z } from 'zod';
import { invoiceSchema } from './invoice';
export const invoiceShareStateSchema = z.object({
  invoiceVersion: z.number().int().positive(),
  invoiceStatus: z.enum(['draft', 'issued']),
  updatedAt: z.string().datetime(),
  share: z
    .object({
      issuedAt: z.string().datetime(),
      expiresAt: z.string().datetime(),
      revokedAt: z.string().datetime().nullable(),
      state: z.enum(['active', 'expired', 'revoked']),
    })
    .nullable(),
});
export const newInvoiceShareSchema = invoiceShareStateSchema.extend({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});
export const publicInvoiceSchema = invoiceSchema
  .pick({
    number: true,
    title: true,
    summary: true,
    terms: true,
    currency: true,
    items: true,
    totalMinor: true,
  })
  .extend({
    status: z.literal('issued'),
    client: z.object({ name: z.string(), company: z.string() }),
    senderName: z.string(),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    validForSeconds: z
      .number()
      .int()
      .positive()
      .max(30 * 86400),
  });
export type InvoiceShareState = z.infer<typeof invoiceShareStateSchema>;
export type PublicInvoice = z.infer<typeof publicInvoiceSchema>;
