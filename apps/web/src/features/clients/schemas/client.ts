import { z } from 'zod';
import { listOrderSchema } from '../../../shared/schemas/list-order';
import { normalizeInternationalPhone } from '../services/phone-number';
export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  company: z.string(),
  notes: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
export type Client = z.infer<typeof clientSchema>;
export const clientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .refine(
      (value) =>
        Array.from(value).length >= 2 && Array.from(value).length <= 100,
      'اكتب اسم من حرفين إلى 100 حرف.',
    ),
  email: z
    .string()
    .trim()
    .refine(
      (value) =>
        !value ||
        (value.length <= 254 &&
          /^[a-z0-9.!#$%&'*+\/=?^_\x60{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/iu.test(
            value,
          )),
      'اكتب بريد إلكتروني صحيح.',
    ),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => normalizeInternationalPhone(value) !== null,
      'اكتب رقم صحيح للدولة المختارة، أو رقم دولي يبدأ بكود الدولة.',
    )
    .transform((value) => normalizeInternationalPhone(value)!),
  company: z
    .string()
    .trim()
    .refine(
      (value) => Array.from(value).length <= 120,
      'اسم الشركة طويل (حتى 120 حرف).',
    ),
  notes: z
    .string()
    .trim()
    .refine(
      (value) => Array.from(value).length <= 2000,
      'الملاحظات طويلة (حتى 2000 حرف).',
    ),
});
export type ClientDetails = z.infer<typeof clientFormSchema>;

export const contactFilterSchema = z.enum(['all', 'email', 'phone', 'none']);
export type ContactFilter = z.infer<typeof contactFilterSchema>;
export const clientFiltersSchema = z.object({
  archived: z.boolean(),
  search: z
    .string()
    .refine(
      (value) =>
        Array.from(value).length <= 100 &&
        !/[\u0000-\u001f\u007f]/u.test(value),
    ),
  contact: contactFilterSchema,
  order: listOrderSchema,
});
export type ClientFilters = z.infer<typeof clientFiltersSchema>;
