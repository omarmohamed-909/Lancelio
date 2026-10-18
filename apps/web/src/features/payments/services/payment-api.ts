import { request, ApiError } from '../../../shared/api/http-client';
import { errorMessage } from '../../auth/services/auth-api';
import { paymentLedgerSchema } from '../schemas/payment';
import type { PaymentInput } from '../schemas/payment';
const path = (id: string) => '/invoices/' + id + '/payments';
export const paymentApi = {
  read: (token: string, id: string, signal: AbortSignal) =>
    request(path(id), paymentLedgerSchema, { token, method: 'GET', signal }),
  add: (
    token: string,
    id: string,
    version: number,
    requestId: string,
    input: PaymentInput,
    signal: AbortSignal,
  ) =>
    request(path(id), paymentLedgerSchema, {
      token,
      body: { ...input, version, requestId },
      signal,
    }),
  void: (
    token: string,
    id: string,
    paymentId: string,
    version: number,
    reason: string,
    signal: AbortSignal,
  ) =>
    request(path(id) + '/' + paymentId + '/void', paymentLedgerSchema, {
      token,
      body: { version, reason },
      signal,
    }),
};
export function paymentError(cause: unknown) {
  if (cause instanceof ApiError) {
    const messages: Record<string, string> = {
      PAYMENT_CONFLICT:
        'السجل اتغير في مكان تاني. اقرأ الدفعات الحالية قبل أي تغيير.',
      PAYMENT_REQUEST_CONFLICT:
        'مفتاح الدفعة مستخدم لبيانات مختلفة. اقرأ السجل قبل تسجيل دفعة جديدة.',
      PAYMENT_INVOICE_LOCKED: 'إصدار الفاتورة مطلوب قبل تسجيل دفعاتها.',
      PAYMENT_INVOICE_NOT_FOUND: 'الفاتورة مش موجودة في مساحتك.',
      PAYMENT_NOT_FOUND: 'الدفعة مش موجودة في الفاتورة دي.',
      PAYMENT_OVERPAYMENT: 'المبلغ أكبر من المتبقي. اقرأ السجل وراجع المبلغ.',
      PAYMENT_LIMIT_REACHED: 'وصلت لحد 200 إدخال في سجل الفاتورة.',
      VALIDATION_ERROR:
        'راجع المبلغ والتاريخ والبيانات؛ التاريخ المستقبلي مش متاح.',
    };
    if (messages[cause.code]) return messages[cause.code]!;
  }
  return errorMessage(cause);
}
export function paymentWriteBlocked(cause: unknown) {
  return (
    !(cause instanceof ApiError) ||
    cause.status === 0 ||
    cause.status >= 500 ||
    [
      'PAYMENT_CONFLICT',
      'PAYMENT_REQUEST_CONFLICT',
      'PAYMENT_INVOICE_LOCKED',
      'PAYMENT_INVOICE_NOT_FOUND',
      'PAYMENT_NOT_FOUND',
      'PAYMENT_OVERPAYMENT',
    ].includes(cause.code)
  );
}
