import { z } from 'zod';
const cursor = z.string().max(100).nullable();
export const portalStateSchema = z.object({
  client: z.object({
    id: z.string(),
    name: z.string(),
    company: z.string(),
    archived: z.boolean(),
  }),
  version: z.number().int().nonnegative(),
  share: z
    .object({
      issuedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      revokedAt: z.iso.datetime().nullable(),
      state: z.enum(['active', 'expired', 'revoked']),
    })
    .nullable(),
});
export const portalPageSchema = z.object({
  client: z.object({ name: z.string(), company: z.string() }),
  workspaceName: z.string(),
  asOf: z.iso.datetime(),
  projects: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        status: z.enum(['active', 'on_hold', 'completed', 'cancelled']),
        progress: z.object({
          total: z.number().int().nonnegative().max(200),
          done: z.number().int().nonnegative().max(200),
          percentage: z.number().int().min(0).max(100).nullable(),
        }),
        tasks: z
          .array(
            z.object({
              title: z.string(),
              description: z.string(),
              status: z.enum(['todo', 'in_progress', 'done']),
            }),
          )
          .max(200),
      }),
    )
    .max(5),
  invoices: z
    .array(
      z.object({
        number: z.string(),
        title: z.string(),
        currency: z.enum(['EGP', 'USD', 'EUR', 'SAR']),
        totalMinor: z.number().int().nonnegative().max(100000000000),
        paidMinor: z.number().int().nonnegative().max(100000000000),
        remainingMinor: z.number().int().nonnegative().max(100000000000),
        paymentStatus: z.enum(['unpaid', 'partially_paid', 'paid']),
        issuedAt: z.iso.datetime(),
      }),
    )
    .max(5),
  nextProjectCursor: cursor,
  nextInvoiceCursor: cursor,
});
export const publicPortalSchema = portalPageSchema.extend({
  expiresAt: z.iso.datetime(),
  validForSeconds: z
    .number()
    .int()
    .positive()
    .max(30 * 86400),
});
export type PortalState = z.infer<typeof portalStateSchema>;
export type PortalPage = z.infer<typeof portalPageSchema>;
export interface PortalCursors {
  projects: string | null;
  invoices: string | null;
}

export const newPortalStateSchema = portalStateSchema.extend({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});
