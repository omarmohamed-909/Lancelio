import { request, ApiError } from '../../../shared/api/http-client';
import {
  notificationPageSchema,
  notificationSummarySchema,
  notificationReadSchema,
} from '../schemas/notifications';
export const notificationsApi = {
  list: (
    token: string,
    filter: 'all' | 'unread',
    cursor: string | null,
    signal: AbortSignal,
  ) => {
    const query = new URLSearchParams({ filter });
    if (cursor) query.set('cursor', cursor);
    return request('/notifications?' + query, notificationPageSchema, {
      method: 'GET',
      token,
      signal,
    });
  },
  summary: (token: string, signal: AbortSignal) =>
    request('/notifications/summary', notificationSummarySchema, {
      method: 'GET',
      token,
      signal,
    }),
  setRead: (
    token: string,
    id: string,
    version: number,
    read: boolean,
    signal: AbortSignal,
  ) =>
    request(
      '/notifications/' + encodeURIComponent(id) + '/read',
      notificationReadSchema,
      { token, body: { read, version }, signal },
    ),
};
export function notificationError(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.code === 'NOTIFICATION_CONFLICT')
      return 'حالة الإشعار اتغيرت. اقرأ القائمة من جديد قبل تغييرها.';
    if (cause.code === 'NOTIFICATION_NOT_FOUND')
      return 'الإشعار مش متاح. اقرأ القائمة من جديد.';
  }
  return 'تعذر تحميل الإشعارات. جرّب قراءة القائمة مرة تانية.';
}
