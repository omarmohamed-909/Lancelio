'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { notifySuccess, confirmAction } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import { invoiceError } from '../services/invoice-api';
import { invoiceSharingApi } from '../services/invoice-sharing-api';
import type { Invoice } from '../schemas/invoice';
import type { InvoiceShareState } from '../schemas/invoice-share';
const labels = {
  active: 'الرابط شغال',
  expired: 'صلاحية الرابط انتهت',
  revoked: 'الرابط ملغي',
};
export function InvoiceSharing({
  invoice,
  onChanged,
  reload,
}: {
  invoice: Invoice;
  onChanged: (state: InvoiceShareState) => void;
  reload: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const { manager } = useSession();
  const [state, setState] = useState<InvoiceShareState | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [days, setDays] = useState(7),
    [link, setLink] = useState(''),
    [copied, setCopied] = useState('');
  const guard = useRef(false),
    lifetime = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void manager
      .authorized((token) =>
        invoiceSharingApi.read(token, invoice.id, controller.signal),
      )
      .then((result) => {
        if (!controller.signal.aborted) setState(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(invoiceError(cause));
      });
    return () => controller.abort();
  }, [manager, invoice.id]);
  const stale = state !== null && state.invoiceVersion !== invoice.version,
    ready = state !== null && !stale && !busy && !blocked;
  async function mutate(action: 'issue' | 'revoke') {
    if (guard.current || !ready) return;
    if (
      action === 'revoke' &&
      !(await confirmAction(t('إلغاء الرابط هيمنع فتح الفاتورة منه. متأكد؟')))
    )
      return;
    if (
      action === 'issue' &&
      state?.share &&
      !(await confirmAction(t('الرابط الجديد هيلغي القديم. نكمل؟')))
    )
      return;
    guard.current = true;
    setBusy(true);
    setError('');
    setCopied('');
    setLink('');
    let stop = false;
    try {
      const controller = lifetime.current;
      if (!controller) return;
      const result = await manager.authorized((token) =>
        action === 'issue'
          ? invoiceSharingApi.issue(
              token,
              invoice.id,
              invoice.version,
              days,
              controller.signal,
            )
          : invoiceSharingApi.revoke(
              token,
              invoice.id,
              invoice.version,
              controller.signal,
            ),
      );
      if (controller.signal.aborted) return;
      setState(result);
      setLink(
        'token' in result && typeof result.token === 'string'
          ? window.location.origin + '/share/invoice#' + result.token
          : '',
      );
      onChanged(result);
      notifySuccess(
        action === 'issue'
          ? t('رابط الفاتورة جاهز للمشاركة.')
          : t('رابط الفاتورة اتلغى.'),
        true,
      );
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
                'نتيجة تغيير الرابط مش مؤكدة. حدّث الفاتورة وحالة الرابط قبل أي محاولة جديدة.',
              )
            : invoiceError(cause),
        );
      }
    } finally {
      guard.current = stop;
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      if (!lifetime.current?.signal.aborted)
        setCopied(t('الرابط اتنسخ. جاهز تبعته للعميل.'));
    } catch {
      if (lifetime.current?.signal.aborted) return;
      input.current?.focus();
      input.current?.select();
      setCopied(t('حددنا الرابط. انسخه من الحقل.'));
    }
  }
  return (
    <section
      className="proposal-sharing"
      aria-labelledby="invoice-sharing-title"
    >
      <div className="proposal-share-heading">
        <div>
          <span className="form-eyebrow">{t('نسخة ثابتة للعميل')}</span>
          <h2 id="invoice-sharing-title">{t('مشاركة الفاتورة')}</h2>
          <p>
            {t(
              'رابط للقراءة من غير حساب. تجديده بيغيّر الرابط فقط، وبيانات الفاتورة بتفضل ثابتة.',
            )}{' '}
          </p>
        </div>
      </div>
      {!state && !error && <p role="status">{t('بنراجع حالة المشاركة…')}</p>}
      {state && (
        <div className="proposal-share-state">
          <span className="proposal-status">
            {state.share ? t(labels[state.share.state]) : t('لسه خاص بمساحتك')}
          </span>
          {state.share && (
            <span>
              {t('صالح حتى')}{' '}
              {new Intl.DateTimeFormat(intlLocale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(state.share.expiresAt))}
            </span>
          )}
        </div>
      )}
      {stale && (
        <p className="form-notice" role="alert">
          {t('الفاتورة اتغيرت في مكان تاني. حدّثها قبل تغيير الرابط.')}{' '}
        </p>
      )}
      {error && (
        <p className="form-notice" role="alert">
          {t(error)}
        </p>
      )}
      {(stale || blocked || (!state && error)) && (
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={reload}
        >
          {t('تحديث الفاتورة وحالة الرابط')}{' '}
        </button>
      )}
      <div className="proposal-share-controls">
        <div>
          <label htmlFor="invoice-share-days">{t('صلاحية الرابط')}</label>
          <Select
            id="invoice-share-days"
            value={days}
            disabled={!ready}
            onValueChange={(value) => setDays(Number(value))}
          >
            <option value={1}>{t('يوم واحد')}</option>
            <option value={7}>{t('7 أيام')}</option>
            <option value={14}>{t('14 يوم')}</option>
            <option value={30}>{t('30 يوم')}</option>
          </Select>
        </div>
        <button
          type="button"
          className="button button-primary"
          disabled={!ready}
          onClick={() => void mutate('issue')}
        >
          {busy
            ? t('بنغيّر الرابط…')
            : state?.share
              ? t('تجديد رابط المشاركة')
              : t('إنشاء رابط مشاركة')}
        </button>
        {state?.share && state.share.state !== 'revoked' && (
          <button
            className="button"
            type="button"
            disabled={!ready}
            onClick={() => void mutate('revoke')}
          >
            {t('إلغاء الرابط')}{' '}
          </button>
        )}
      </div>
      {link && (
        <div className="proposal-share-link">
          <label htmlFor="invoice-share-url">{t('رابط العميل')}</label>
          <div>
            <input
              id="invoice-share-url"
              ref={input}
              dir="ltr"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              className="button"
              type="button"
              onClick={() => void copy()}
            >
              {t('نسخ الرابط')}{' '}
            </button>
            <a
              className="button"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('معاينة العميل')}{' '}
            </a>
          </div>
          <p role="status">
            {copied ||
              t(
                'احفظ الرابط؛ مش بنعرضه تاني بعد مغادرة الصفحة. تقدر تجدده لو فقدته.',
              )}
          </p>
        </div>
      )}
      <p className="proposal-share-note">
        {t(
          'أي حد معاه الرابط يقدر يقرأ الفاتورة طول مدة الصلاحية. انسخه وابعته للعميل؛ إنشاء الرابط مش بيبعت رسالة.',
        )}{' '}
      </p>
    </section>
  );
}
