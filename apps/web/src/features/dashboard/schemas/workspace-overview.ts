import { z } from 'zod';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const minor = z.string().regex(/^\d+$/u);
export const overviewSchema = z.object({
  asOf: z.iso.datetime(),
  clients: z.object({ active: count, archived: count }),
  proposals: z.object({
    draft: count,
    sent: count,
    accepted: count,
    rejected: count,
    expired: count,
  }),
  projects: z.object({
    active: count,
    on_hold: count,
    completed: count,
    cancelled: count,
  }),
  tasks: z.object({ todo: count, in_progress: count, done: count }),
  invoices: z.object({ draft: count, issued: count }),
  finances: z
    .array(
      z.object({
        currency: z.enum(['EGP', 'USD', 'EUR', 'SAR']),
        invoicedMinor: minor,
        receivedMinor: minor,
        outstandingMinor: minor,
      }),
    )
    .max(4),
  expiringProposals: z
    .array(
      z.object({
        id: z.string().regex(/^[a-f\d]{24}$/u),
        title: z.string(),
        expiresAt: z.iso.datetime(),
      }),
    )
    .max(5),
});
export type WorkspaceOverview = z.infer<typeof overviewSchema>;
