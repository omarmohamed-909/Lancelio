import { z } from 'zod';
import { parsePrice, previewTotal } from '../money';
export const currencySchema = z.enum(['EGP', 'USD', 'EUR', 'SAR']);
function text(min: number, max: number, message: string) {
  return z
    .string()
    .trim()
    .refine(
      (value) =>
        Array.from(value).length >= min && Array.from(value).length <= max,
      message,
    );
}
export const draftSchema = z
  .object({
    clientId: z.string().regex(/^[a-f0-9]{24}$/u, 'اختار عميل.'),
    title: text(2, 120, 'اكتب عنوان من حرفين إلى 120 حرف.'),
    summary: text(0, 3000, 'وصف الشغل طويل (حتى 3000 حرف).'),
    terms: text(0, 2000, 'الشروط طويلة (حتى 2000 حرف).'),
    currency: currencySchema,
    items: z
      .array(
        z.object({
          title: text(2, 120, 'اكتب وصف البند من حرفين إلى 120 حرف.'),
          quantity: z
            .number()
            .int('الكمية لازم تكون عدد صحيح.')
            .min(1, 'أقل كمية هي 1.')
            .max(10000, 'أكبر كمية هي 10000.'),
          unitPrice: z
            .string()
            .trim()
            .refine(
              (value) => parsePrice(value) !== null,
              'اكتب سعر غير سالب، بمنزلتين عشريتين بحد أقصى.',
            ),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((draft, ctx) => {
    if (previewTotal(draft.items) === null)
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message:
          'راجع الأسعار والكميات. الحد الأقصى للإجمالي مليار وحدة من العملة.',
      });
  });
export type DraftInput = z.infer<typeof draftSchema>;
