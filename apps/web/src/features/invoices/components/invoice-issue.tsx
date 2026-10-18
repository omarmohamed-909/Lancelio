'use client';
import { useI18n } from '../../../i18n/language-provider';

import { confirmAction, notifySuccess } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import { invoiceApi, invoiceError } from '../services/invoice-api';
import type { Invoice } from '../schemas/invoice';
export function InvoiceIssue({
  invoice,
  onSaved,
  reload,
}: {
  invoice: Invoice;
  onSaved: (invoice: Invoice) => void;
  reload: () => void;
}) {
  const { t } = useI18n();
  const { manager } = useSession();
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState('');
  const guard = useRef(false),
    lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  async function issue() {
    if (guard.current || !reviewed || blocked) return;
    if (
      !(await confirmAction(
        t('إصدار الفاتورة هيقفل تعديل البنود والأسعار. متأكد؟'),
      ))
    )
      return;
    guard.current = true;
    setBusy(true);
    setError('');
    let stop = true;
    try {
      const controller = lifetime.current;
      if (!controller) return;
      const result = await manager.authorized((token) =>
        invoiceApi.issue(token, invoice.id, invoice.version, controller.signal),
      );
      if (!controller.signal.aborted) {
        notifySuccess(t('الفاتورة اتصدرت واتحفظت نسختها النهائية.'), true);
        onSaved(result);
      }
    } catch (cause: unknown) {
      if (!lifetime.current?.signal.aborted) {
        const uncertain =
          !(cause instanceof ApiError) ||
          cause.status === 0 ||
          cause.status >= 500;
        stop =
          uncertain ||
          (cause instanceof ApiError &&
            (cause.code === 'INVOICE_CONFLICT' ||
              cause.code === 'INVOICE_LOCKED'));
        setBlocked(stop);
        setError(
          uncertain
            ? t(
                'نتيجة الإصدار مش مؤكدة. اقرأ الفاتورة الحالية قبل أي محاولة جديدة.',
              )
            : invoiceError(cause),
        );
      }
    } finally {
      guard.current = stop;
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="proposal-sharing" aria-labelledby="invoice-issue-title">
      <h2 id="invoice-issue-title">{t('إصدار الفاتورة')}</h2>
      <p>
        {t(
          'بنثبت بيانات العميل الحالية واسم المرسل وتاريخ الإصدار. بعدها البنود والأسعار بتفضل ثابتة، حتى لو رابط المشاركة اتلغى.',
        )}{' '}
      </p>
      <label className="proposal-share-confirm">
        <input
          type="checkbox"
          checked={reviewed}
          disabled={busy || blocked}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        <span>{t('راجعت الفاتورة وجاهز لإصدارها.')}</span>
      </label>
      {error && (
        <p className="form-notice" role="alert">
          {t(error)}
        </p>
      )}
      <div className="proposal-share-controls">
        <button
          type="button"
          className="button button-primary"
          disabled={!reviewed || busy || blocked}
          onClick={() => void issue()}
        >
          {busy ? t('بنصدر الفاتورة…') : t('إصدار الفاتورة')}
        </button>
        {blocked && (
          <button type="button" className="button" onClick={reload}>
            {t('قراءة الفاتورة الحالية')}{' '}
          </button>
        )}
      </div>
    </section>
  );
}
