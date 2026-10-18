import type { ListOrder } from '../../../shared/schemas/list-order';
import { ApiError, request } from '../../../shared/api/http-client';
import { errorMessage } from '../../auth/services/auth-api';
import { invoiceSchema, invoicePageSchema } from '../schemas/invoice';
import type { DraftInput } from '../../../shared/schemas/priced-document';
export const invoiceApi = {
  list: (
    token: string,
    cursor?: string,
    signal?: AbortSignal,
    order: ListOrder = 'newest',
  ) =>
    request(
      '/invoices' +
        (cursor || order === 'oldest'
          ? '?' +
            new URLSearchParams({
              ...(cursor ? { cursor } : {}),
              ...(order === 'oldest' ? { order } : {}),
            })
          : ''),
      invoicePageSchema,
      { token, method: 'GET', ...(signal ? { signal } : {}) },
    ),
  read: (token: string, id: string, signal: AbortSignal) =>
    request('/invoices/' + id, invoiceSchema, { token, method: 'GET', signal }),
  update: (
    token: string,
    id: string,
    version: number,
    input: DraftInput,
    projectId: string | null,
    signal: AbortSignal,
  ) =>
    request('/invoices/' + id, invoiceSchema, {
      token,
      method: 'PUT',
      body: { ...input, projectId, version },
      signal,
    }),
  issue: (token: string, id: string, version: number, signal: AbortSignal) =>
    request('/invoices/' + id + '/issue', invoiceSchema, {
      token,
      body: { version },
      signal,
    }),
  create: (
    token: string,
    input: DraftInput,
    requestId: string,
    projectId: string | null,
    signal: AbortSignal,
  ) =>
    request('/invoices', invoiceSchema, {
      token,
      body: { ...input, requestId, projectId },
      signal,
    }),
};
export function invoiceError(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVOICE_CONFLICT':
        return 'الفاتورة اتغيرت في مكان تاني. حمّل آخر نسخة وراجعها.';
      case 'INVOICE_LOCKED':
        return 'الفاتورة صدرت؛ البنود والأسعار مقفولة.';
      case 'INVOICE_NOT_ISSUED':
        return 'أصدر الفاتورة قبل إنشاء رابط مشاركة.';
      case 'INVOICE_SHARE_UNAVAILABLE':
        return 'رابط المشاركة مش متاح.';
      case 'INVOICE_NOT_FOUND':
        return 'الفاتورة مش موجودة في مساحتك.';
      case 'INVOICE_CLIENT_UNAVAILABLE':
        return 'العميل مش متاح لفاتورة جديدة. اختار عميل نشط.';
      case 'INVOICE_PROJECT_UNAVAILABLE':
        return 'راجع المشروع؛ لازم يكون لنفس العميل وفي مساحتك.';
      case 'INVOICE_REQUEST_CONFLICT':
        return 'عملية الإنشاء دي اتسجلت بمحتوى مختلف. راجع دفتر الفواتير.';
      case 'INVOICE_NUMBER_EXHAUSTED':
        return 'وصلت المساحة لحد ترقيم الفواتير.';
      case 'VALIDATION_ERROR':
        return 'راجع بيانات الفاتورة والأسعار قبل الحفظ.';
    }
  }
  return errorMessage(error);
}
