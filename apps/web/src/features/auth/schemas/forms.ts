import { z } from 'zod';

const email = z.string().trim().email('اكتب بريد إلكتروني صحيح.');
export const displayNameSchema = z
  .string()
  .trim()
  .refine((value) => Array.from(value).length >= 2, 'اكتب حرفين على الأقل.')
  .refine(
    (value) => Array.from(value).length <= 100,
    'الاسم طويل؛ الحد الأقصى ١٠٠ حرف.',
  );
export const loginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, 'اكتب كلمة المرور.')
    .refine(
      (value) => Array.from(value).length <= 128,
      'كلمة المرور طويلة جدًا.',
    ),
});
export const registerSchema = z.object({
  name: displayNameSchema,
  email,
  workspaceName: z.union([z.literal(''), displayNameSchema]),
  password: z
    .string()
    .refine(
      (value) =>
        Array.from(value).length >= 15 && Array.from(value).length <= 128,
      'استخدم كلمة مرور من ١٥ إلى ١٢٨ حرفًا.',
    ),
});
export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z
  .object({ password: registerSchema.shape.password, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, {
    path: ['confirmation'],
    message: 'كلمتا المرور لازم يكونوا متطابقين.',
  });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
