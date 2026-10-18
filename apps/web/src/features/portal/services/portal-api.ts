import { request, ApiError } from '../../../shared/api/http-client';
import { errorMessage } from '../../auth/services/auth-api';
import {
  newPortalStateSchema,
  portalStateSchema,
  portalPageSchema,
  publicPortalSchema,
} from '../schemas/portal';
import type { PortalCursors } from '../schemas/portal';
const path = (id: string) => '/clients/' + id + '/portal';
export const portalApi = {
  state: (token: string, id: string, signal: AbortSignal) =>
    request(path(id), portalStateSchema, { token, method: 'GET', signal }),
  preview: (
    token: string,
    id: string,
    cursors: PortalCursors,
    signal: AbortSignal,
  ) =>
    request(
      path(id) +
        '/preview?' +
        new URLSearchParams({
          ...(cursors.projects ? { projects: cursors.projects } : {}),
          ...(cursors.invoices ? { invoices: cursors.invoices } : {}),
        }),
      portalPageSchema,
      { token, method: 'GET', signal },
    ),
  issue: (
    token: string,
    id: string,
    version: number,
    days: number,
    signal: AbortSignal,
  ) =>
    request(path(id), newPortalStateSchema, {
      token,
      body: { version, days },
      signal,
    }),
  revoke: (token: string, id: string, version: number, signal: AbortSignal) =>
    request(path(id) + '/revoke', portalStateSchema, {
      token,
      body: { version },
      signal,
    }),
  readPublic: (token: string, cursors: PortalCursors, signal: AbortSignal) =>
    request('/public/portal/read', publicPortalSchema, {
      body: { token, ...cursors },
      credentials: 'omit',
      signal,
    }),
};
export function portalError(cause: unknown) {
  if (cause instanceof ApiError) {
    const errors: Record<string, string> = {
      PORTAL_CONFLICT: 'حالة الرابط اتغيرت. اقرأ آخر نسخة قبل أي تغيير.',
      PORTAL_SHARE_UNAVAILABLE: 'رابط المتابعة غير متاح.',
      CLIENT_ARCHIVED:
        'العميل مؤرشف؛ بوابته غير متاحة ولا يمكن إنشاء رابط جديد.',
      CLIENT_NOT_FOUND: 'العميل مش موجود في مساحتك.',
      VALIDATION_ERROR: 'راجع صلاحية الرابط والبيانات.',
    };
    if (errors[cause.code]) return errors[cause.code]!;
  }
  return errorMessage(cause);
}
