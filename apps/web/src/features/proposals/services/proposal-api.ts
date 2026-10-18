import type { ListOrder } from '../../../shared/schemas/list-order';
import { request, ApiError } from '../../../shared/api/http-client';
import { errorMessage } from '../../auth/services/auth-api';
import { pageSchema, proposalSchema } from '../schemas/proposal';
import type { DraftInput } from '../schemas/proposal';
export const proposalApi = {
  list: (
    token: string,
    cursor?: string,
    signal?: AbortSignal,
    order: ListOrder = 'newest',
  ) =>
    request(
      '/proposals' +
        (cursor || order === 'oldest'
          ? '?' +
            new URLSearchParams({
              ...(cursor ? { cursor } : {}),
              ...(order === 'oldest' ? { order } : {}),
            })
          : ''),
      pageSchema,
      { method: 'GET', token, ...(signal ? { signal } : {}) },
    ),
  read: (token: string, id: string, signal?: AbortSignal) =>
    request('/proposals/' + id, proposalSchema, {
      method: 'GET',
      token,
      ...(signal ? { signal } : {}),
    }),
  create: (token: string, body: DraftInput) =>
    request('/proposals', proposalSchema, { token, body }),
  update: (token: string, id: string, version: number, body: DraftInput) =>
    request('/proposals/' + id, proposalSchema, {
      method: 'PUT',
      token,
      body: { ...body, version },
    }),
};
export function proposalError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'PROPOSAL_SHARE_UNAVAILABLE':
        return 'رابط المشاركة مش متاح. حدّث حالة العرض.';
      case 'PROPOSAL_NOT_FOUND':
        return 'العرض مش موجود في مساحتك.';
      case 'PROPOSAL_CLIENT_UNAVAILABLE':
        return 'العميل مش متاح لعرض جديد. اختار عميل نشط من مساحتك.';
      case 'PROPOSAL_CONFLICT':
        return 'العرض اتعدل من مكان تاني. حمّل آخر نسخة وراجعها قبل التعديل.';
      case 'PROPOSAL_LOCKED':
        return 'العرض ده خرج من مرحلة المسودة ومش قابل للتعديل.';
      case 'VALIDATION_ERROR':
        return 'راجع بيانات العرض والأسعار قبل الحفظ.';
    }
  }
  return errorMessage(error);
}
export const statusLabels = {
  draft: 'مسودة',
  sent: 'مُشارك',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  expired: 'منتهي',
};
