import { z } from 'zod';
import { request, ApiError } from '../../../shared/api/http-client';
import { portalPageSchema } from '../schemas/portal';
import type { PortalCursors } from '../schemas/portal';
import { errorMessage } from '../../auth/services/auth-api';
export const clientAccessSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  email: z.string(),
  workspaceName: z.string(),
  clientName: z.string(),
  state: z.enum(['pending', 'accepted', 'declined', 'revoked', 'expired']),
  expiresAt: z.iso.datetime(),
});
export type ClientAccess = z.infer<typeof clientAccessSchema>;
const ownerSchema = z.object({
  email: z.string(),
  version: z.number().int(),
  access: clientAccessSchema.nullable(),
});
export const clientAccessApi = {
  owner: (token: string, id: string, signal?: AbortSignal) =>
    request('/client-access/owner/' + id, ownerSchema, {
      token,
      method: 'GET',
      ...(signal ? { signal } : {}),
    }),
  issue: (
    token: string,
    id: string,
    version: number,
    locale: 'ar' | 'en',
    email: string,
  ) =>
    request(
      '/client-access/owner/' + id,
      z.object({
        access: clientAccessSchema,
        token: z.string(),
        delivery: z.enum(['accepted', 'unavailable', 'failed']),
      }),
      { token, body: { version, locale, email } },
    ),
  revoke: (token: string, id: string, version: number) =>
    request('/client-access/owner/' + id + '/revoke', z.undefined(), {
      token,
      body: { version },
    }),
  list: (token: string, signal?: AbortSignal, after?: string) =>
    request(
      '/client-access/list' +
        (after ? '?after=' + encodeURIComponent(after) : ''),
      z.object({
        verificationRequired: z.boolean(),
        items: z.array(clientAccessSchema),
        hasMore: z.boolean(),
        nextCursor: z.string().nullable(),
      }),
      { token, method: 'GET', ...(signal ? { signal } : {}) },
    ),
  resolve: (token: string, invitation: string) =>
    request('/client-access/resolve', clientAccessSchema, {
      token,
      body: { token: invitation },
    }),
  decide: (
    token: string,
    item: ClientAccess,
    accept: boolean,
    invitation: string | null,
  ) =>
    request('/client-access/' + item.id + '/decide', z.undefined(), {
      token,
      body: { version: item.version, accept, token: invitation },
    }),
  leave: (token: string, item: ClientAccess) =>
    request('/client-access/' + item.id + '/leave', z.undefined(), {
      token,
      body: { version: item.version },
    }),
  page: (
    token: string,
    id: string,
    cursors: PortalCursors,
    signal: AbortSignal,
  ) =>
    request('/client-access/' + id + '/portal', portalPageSchema, {
      token,
      body: cursors,
      signal,
    }),
};
export function clientAccessError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'CLIENT_INVITATION_UNAVAILABLE')
      return 'الدعوة غير متاحة. تأكد إنك داخل بنفس البريد المدعو، أو اطلب دعوة جديدة.';
    if (error.code === 'CLIENT_EMAIL_VERIFICATION_REQUIRED')
      return 'افتح رابط الدعوة من بريدك، أو سجّل باستخدام Google بنفس البريد لتأكيد ملكيته.';
    if (error.code === 'PORTAL_CONFLICT')
      return 'الدعوة اتغيرت. حدّث الصفحة قبل المحاولة تاني.';
    if (error.code === 'VALIDATION_ERROR')
      return 'ضيف بريد إلكتروني صحيح للعميل الأول.';
  }
  return errorMessage(error);
}
