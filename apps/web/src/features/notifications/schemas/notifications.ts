import { z } from 'zod';
export const notificationSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'proposal_accepted',
    'proposal_rejected',
    'invoice_issued',
    'payment_received',
    'payment_voided',
  ]),
  title: z.string(),
  occurredAt: z.iso.datetime(),
  target: z.object({
    type: z.enum(['proposal', 'invoice']),
    id: z.string().regex(/^[a-f\d]{24}$/u),
  }),
  read: z.boolean(),
  readAt: z.iso.datetime().nullable(),
  version: z.number().int().nonnegative(),
});
export const notificationPageSchema = z.object({
  items: z.array(notificationSchema).max(25),
  unreadCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  asOf: z.iso.datetime(),
});
export const notificationSummarySchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  asOf: z.iso.datetime(),
});
export const notificationReadSchema = notificationSchema.pick({
  id: true,
  read: true,
  readAt: true,
  version: true,
});
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;
