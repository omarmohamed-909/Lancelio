import { ApiError, request } from '../../../shared/api/http-client';
export { ApiError } from '../../../shared/api/http-client';
import { z } from 'zod';

export const identitySchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  workspace: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  membership: z.object({
    id: z.string(),
    role: z.enum(['owner', 'admin', 'member']),
  }),
});
const credentialsSchema = identitySchema.extend({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  tokenType: z.literal('Bearer'),
});
const googleResultSchema = z.discriminatedUnion('kind', [
  credentialsSchema.extend({ kind: z.literal('authenticated') }),
  z.object({
    kind: z.literal('onboarding-required'),
    email: z.string(),
    name: z.string(),
  }),
]);
export interface GoogleSignInData {
  credential: string;
  name?: string;
  workspaceName?: string;
}
export type Identity = z.infer<typeof identitySchema>;
export type Credentials = z.infer<typeof credentialsSchema>;
export interface LoginData {
  email: string;
  password: string;
}
export interface RegistrationData extends LoginData {
  name: string;
  workspaceName?: string;
}

export const authApi = {
  googleConfig: (signal?: AbortSignal) =>
    request(
      '/auth/google/config',
      z.discriminatedUnion('enabled', [
        z.object({ enabled: z.literal(false) }),
        z.object({ enabled: z.literal(true), clientId: z.string().min(1) }),
      ]),
      { method: 'GET', ...(signal ? { signal } : {}) },
    ),
  googleChallenge: () =>
    request('/auth/google/challenge', z.object({ nonce: z.string().min(1) }), {
      body: {},
    }),
  googleSignIn: (data: GoogleSignInData) =>
    request('/auth/google', googleResultSchema, { body: data }),
  changePassword: (
    token: string,
    data: { currentPassword: string; newPassword: string },
  ) => request('/settings/password', z.undefined(), { token, body: data }),
  forgotPassword: (email: string) =>
    request('/auth/forgot-password', z.object({ accepted: z.literal(true) }), {
      body: { email },
      credentials: 'omit',
    }),
  resetPassword: (token: string, password: string) =>
    request('/auth/reset-password', z.undefined(), {
      body: { token, password },
      credentials: 'omit',
    }),
  register: (data: RegistrationData) =>
    request('/auth/register', credentialsSchema, { body: data }),
  login: (data: LoginData) =>
    request('/auth/login', credentialsSchema, { body: data }),
  refresh: () => request('/auth/refresh', credentialsSchema, { body: {} }),
  logout: () => request('/auth/logout', z.undefined(), { body: {} }),
  me: (token: string) =>
    request('/auth/me', identitySchema, { method: 'GET', token }),
};

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'حصلت مشكلة غير متوقعة. حاول مرة تانية.';
  switch (error.code) {
    case 'GOOGLE_INVALID_CREDENTIALS':
      return 'اختيار حساب Google انتهت صلاحيته. اختار حسابك من جديد.';
    case 'GOOGLE_ACCOUNT_CONFLICT':
      return 'تعذّر ربط حساب Google. استخدم طريقة الدخول المرتبطة بحسابك، أو اختار حسابك من جديد.';
    case 'GOOGLE_EMAIL_NOT_AUTHORITATIVE':
      return 'Google مش بيؤكد ملكية البريد ده حاليًا. استخدم طريقة الدخول الأصلية أو حساب Gmail أو Google Workspace.';
    case 'PASSWORD_SIGN_IN_CONFIRMATION_REQUIRED':
      return 'كمّل باستخدام Google. لتفعيل الدخول بكلمة المرور، عيّن كلمة مرور جديدة من إعدادات الأمان أو استرجاع البريد.';
    case 'GOOGLE_UNAVAILABLE':
      return 'الدخول بحساب Google مش متاح دلوقتي. تقدر تستخدم البريد وكلمة المرور.';
    case 'PASSWORD_NOT_SET':
      return 'حسابك بيستخدم Google. لإنشاء كلمة مرور، استخدم «نسيت كلمة المرور؟» لتأكيد بريدك أولًا.';
    case 'RECOVERY_UNAVAILABLE':
      return 'خدمة استرجاع كلمة المرور غير متاحة حاليًا. حاول لاحقًا.';
    case 'INVALID_CREDENTIALS':
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    case 'EMAIL_ALREADY_REGISTERED':
      return 'البريد ده مسجل بالفعل. تقدر تسجل دخولك.';
    case 'RATE_LIMITED':
      return 'محاولات كتير في وقت قصير. استنى شوية وحاول تاني.';
    case 'UNAUTHENTICATED':
      return 'جلسة الدخول انتهت. سجل دخولك من جديد.';
    case 'WORKSPACE_ACCESS_DENIED':
      return 'الحساب ده مش مرتبط بمساحة عمل متاحة.';
    case 'UNSUPPORTED_BROWSER':
      return 'جلسة الدخول تحتاج متصفح حديث. حدّث المتصفح وحاول مرة تانية.';
    case 'VALIDATION_ERROR':
      return 'راجع البيانات اللي كتبتها وحاول تاني.';
    case 'UNTRUSTED_ORIGIN':
      return 'الدخول مش متاح من العنوان ده حاليًا.';
    case 'NETWORK_ERROR':
      return 'مش قادرين نتصل بالخدمة. اتأكد من الاتصال وحاول تاني.';
    default:
      return 'الخدمة مش متاحة مؤقتًا. حاول مرة تانية بعد قليل.';
  }
}
