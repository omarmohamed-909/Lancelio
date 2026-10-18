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
    request('/auth/register', identitySchema, { body: data }),
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
    case 'ACCOUNT_CREATED':
      return 'حسابك اتعمل بنجاح، لكن الدخول ماكملش. افتح صفحة تسجيل الدخول وحاول من هناك.';
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
