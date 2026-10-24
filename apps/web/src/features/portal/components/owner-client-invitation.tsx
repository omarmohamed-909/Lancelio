'use client';
import { useEffect, useRef, useState } from 'react';
import { MailPlus, ShieldCheck, Copy, Link2 } from 'lucide-react';
import { useI18n } from '../../../i18n/language-provider';
import { useSession } from '../../auth/components/session-provider';
import {
  clientAccessApi,
  clientAccessError,
} from '../services/client-access-api';
import { confirmAction } from '../../../components/ui/feedback';
export function OwnerClientInvitation({ clientId }: { clientId: string }) {
  const { t, locale } = useI18n();
  const { manager, snapshot } = useSession();
  const [state, setState] = useState<Awaited<
    ReturnType<typeof clientAccessApi.owner>
  > | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [link, setLink] = useState('');
  const [revision, setRevision] = useState(0),
    [reviewed, setReviewed] = useState(false);
  const lock = useRef(false),
    linkInput = useRef<HTMLInputElement>(null);
  const allowed =
    snapshot.status === 'authenticated' &&
    ['owner', 'admin'].includes(snapshot.identity.membership.role);
  useEffect(() => {
    if (!allowed) return;
    const abort = new AbortController();
    void manager
      .authorized((token) =>
        clientAccessApi.owner(token, clientId, abort.signal),
      )
      .then((result) => {
        if (!abort.signal.aborted) setState(result);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(clientAccessError(cause));
      });
    return () => abort.abort();
  }, [manager, clientId, revision, allowed]);
  if (!allowed) return null;
  async function change(revoke: boolean) {
    if (lock.current || !state || (!revoke && !reviewed)) return;
    lock.current = true;
    if (
      !(await confirmAction(
        revoke
          ? 'إلغاء الوصول هيقفل بوابة الحساب فورًا. نكمل؟'
          : 'هنرسل دعوة لبريد العميل المسجل لمشاركة مشاريعه وفواتيره الصادرة والمهام الظاهرة. أي دعوة أو وصول سابق للعميل ده هيتلغى. نكمل؟',
      ))
    ) {
      lock.current = false;
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setLink('');
    try {
      if (revoke) {
        await manager.authorized((token) =>
          clientAccessApi
            .owner(token, clientId)
            .then((current) =>
              clientAccessApi.revoke(token, clientId, current.version),
            ),
        );
        setNotice('وصول العميل اتلغى.');
      } else {
        const result = await manager.authorized((token) =>
          clientAccessApi.issue(
            token,
            clientId,
            state.version,
            locale,
            state.email,
          ),
        );
        setLink(window.location.origin + '/connections#' + result.token);
        setNotice(
          result.delivery === 'accepted'
            ? 'دعوة العميل اتبعتت. تقدر تشارك الرابط كمان.'
            : 'الدعوة جاهزة، لكن إرسال البريد مش مؤكد. انسخ الرابط وابعته للعميل.',
        );
      }
      setReviewed(false);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(clientAccessError(cause));
      setRevision((value) => value + 1);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="client-invitation-panel"
      aria-labelledby="client-invitation-heading"
    >
      <div className="connection-section-title">
        <span className="connection-icon">
          <MailPlus size={23} />
        </span>
        <div>
          <span className="form-eyebrow">{t('وصول مرتبط بالحساب')}</span>
          <h2 id="client-invitation-heading">
            {t('ادعُ العميل لمساحة المتابعة')}
          </h2>
        </div>
      </div>
      <p>
        {t(
          'العميل يقبل الدعوة من حسابه، وبعدها يلاقي بوابتك في «بتتعامل معاهم». مساحته الخاصة تفضل مستقلة.',
        )}
      </p>
      {state && (
        <div className="invitation-recipient">
          <span>{t('البريد المدعو')}</span>
          <strong dir="auto">
            {state.email || t('ضيف بريد للعميل الأول')}
          </strong>
          <span className="proposal-status">
            {t(
              state.access?.state === 'accepted'
                ? 'الوصول مفعّل'
                : state.access?.state === 'pending'
                  ? 'في انتظار القبول'
                  : 'مفيش وصول مفعّل',
            )}
          </span>
        </div>
      )}
      <p className="connection-scope">
        <ShieldCheck size={18} />
        {t(
          'مشاريع العميل وفواتيره الصادرة والمهام الظاهرة فقط. ملاحظاتك وبيانات بقية العملاء تفضل خاصة.',
        )}
      </p>
      <label className="portal-review">
        <input
          type="checkbox"
          checked={reviewed}
          disabled={busy || !state}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        {t('راجعت معاينة البوابة والبريد المدعو وموافق أشاركهم')}
      </label>
      <div className="connection-actions">
        <button
          className="button button-primary"
          disabled={busy || !reviewed || !state?.email}
          onClick={() => void change(false)}
        >
          <MailPlus size={17} />
          {t(state?.version ? 'إرسال دعوة جديدة' : 'إرسال دعوة للعميل')}
        </button>
        {!!state?.version && (
          <button
            className="button"
            disabled={busy}
            onClick={() => void change(true)}
          >
            {t('إلغاء وصول الحساب')}
          </button>
        )}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setError('');
            setRevision((value) => value + 1);
          }}
        >
          {t('تحديث الحالة')}
        </button>
      </div>
      {link && (
        <div className="portal-link">
          <label htmlFor="account-invitation-link">
            <Link2 size={16} />
            {t('رابط الدعوة — صالح ٧ أيام')}
          </label>
          <input
            id="account-invitation-link"
            ref={linkInput}
            value={link}
            readOnly
            dir="ltr"
          />
          <button
            className="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setNotice('رابط الدعوة اتنسخ.');
              } catch {
                linkInput.current?.select();
                setNotice('انسخ رابط الدعوة من الحقل.');
              }
            }}
          >
            <Copy size={16} />
            {t('نسخ الرابط')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
      <p role="status">{t(notice)}</p>
    </section>
  );
}
