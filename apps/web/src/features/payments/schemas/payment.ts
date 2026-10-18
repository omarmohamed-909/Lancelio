import { z } from 'zod';
import { parsePrice } from '../../../shared/money';
export const paymentMethods = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  wallet: 'محفظة إلكترونية',
  other: 'طريقة أخرى',
} as const;
const method = z.enum(['bank_transfer', 'cash', 'wallet', 'other']);
export const paymentFormSchema = z.object({
  amount: z.string().refine((value) => {
    const minor = parsePrice(value);
    return minor !== null && minor > 0n;
  }, 'اكتب مبلغ موجب بمنزلتين عشريتين بحد أقصى.'),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'اختار تاريخ استلام الدفعة.'),
  method,
  reference: z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= 100, 'المرجع لحد 100 حرف.'),
  memo: z
    .string()
    .trim()
    .refine(
      (value) => Array.from(value).length <= 500,
      'الملاحظة لحد 500 حرف.',
    ),
});
export const voidFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .refine(
      (value) =>
        Array.from(value).length >= 2 && Array.from(value).length <= 300,
      'اكتب سبب من 2 إلى 300 حرف.',
    ),
});
const minor = z.number().int().nonnegative().max(100_000_000_000);
export const paymentSchema = z.object({
  id: z.string(),
  amountMinor: minor.positive(),
  paidOn: z.string(),
  method,
  reference: z.string(),
  memo: z.string(),
  createdAt: z.string().datetime(),
  voidedAt: z.string().datetime().nullable(),
  voidReason: z.string().nullable(),
});
export const paymentLedgerSchema = z.object({
  invoiceId: z.string(),
  invoiceStatus: z.enum(['draft', 'issued']),
  currency: z.enum(['EGP', 'USD', 'EUR', 'SAR']),
  totalMinor: minor,
  paidMinor: minor,
  remainingMinor: minor,
  paymentStatus: z.enum(['not_issued', 'unpaid', 'partially_paid', 'paid']),
  version: z.number().int().nonnegative(),
  payments: z.array(paymentSchema).max(200),
});
export type Payment = z.infer<typeof paymentSchema>;
export type PaymentInput = z.infer<typeof paymentFormSchema>;
export type PaymentLedger = z.infer<typeof paymentLedgerSchema>;
