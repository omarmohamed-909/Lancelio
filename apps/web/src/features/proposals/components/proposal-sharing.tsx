'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { notifySuccess, confirmAction } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import { proposalError } from '../services/proposal-api';
import { sharingApi } from '../services/proposal-sharing-api';
import type { Proposal } from '../schemas/proposal';
import type { ProposalShareState } from '../schemas/proposal-share';
const stateLabels = {
  active: 'الرابط شغال',
  expired: 'صلاحية الرابط انتهت',
  revoked: 'الرابط ملغي',
};
export function ProposalSharing({
  proposal,
  reload,
  onChanged,
}: {
  proposal: Proposal;
  reload: () => void;
  onChanged: (state: ProposalShareState) => void;
}) {
  const { t, intlLocale } = useI18n();
  const { manager } = useSession();
  const [state, setState] = useState<ProposalShareState | null>(null);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);
  const [reviewed, setReviewed] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState('');
  const guard = useRef(false);
  const live = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    void manager
      .authorized((token) =>
        sharingApi.read(token, proposal.id, controller.signal),
      )
      .then((result) => {
        if (!controller.signal.aborted) setState(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(proposalError(cause));
      });
    return () => {
      live.current = false;
      controller.abort();
    };
  }, [manager, proposal.id]);
  const stale = state !== null && state.proposalVersion !== proposal.version;
  const ready = state !== null && !stale && !blocked && !busy;
  const canIssue = proposal.status === 'draft' || proposal.status === 'sent';
  async function mutate(action: 'issue' | 'revoke') {
    if (
      guard.current ||
      !ready ||
      (action === 'issue' &&
        (!canIssue || (proposal.status === 'draft' && !reviewed)))
    )
      return;
    if (
      action === 'revoke' &&
      !(await confirmAction(t('إلغاء الرابط هيمنع فتح العرض منه. متأكد؟')))
    )
      return;
    if (
      action === 'issue' &&
      proposal.status === 'sent' &&
      !(await confirmAction(
        t('الرابط الجديد هيلغي القديم ويسمح بقبول أو رفض العرض. نكمل؟'),
      ))
    )
      return;
    guard.current = true;
    setBusy(true);
    setError('');
    setCopied('');
    try {
      const result = await manager.authorized((token) =>
        action === 'issue'
          ? sharingApi.issue(token, proposal.id, proposal.version, days)
          : sharingApi.revoke(token, proposal.id, proposal.version),
      );
      if (!live.current) return;
      setState(result);
      setLink(
        'token' in result && typeof result.token === 'string'
          ? window.location.origin + '/share/proposal#' + result.token
          : '',
      );
      onChanged(result);
      notifySuccess(
        action === 'issue'
          ? t('رابط العرض جاهز للمشاركة.')
          : t('رابط العرض اتلغى.'),
        true,
      );
    } catch (cause: unknown) {
      if (!live.current) return;
      const uncertain =
        cause instanceof ApiError &&
        (cause.status === 0 || cause.status >= 500);
      const conflict =
        cause instanceof ApiError &&
        (cause.code === 'PROPOSAL_CONFLICT' ||
          cause.code === 'PROPOSAL_LOCKED');
      setBlocked(uncertain || conflict);
      if (uncertain || conflict) setLink('');
      setError(
        uncertain
          ? t(
              'مش قادرين نتأكد إن تغيير الرابط وصل. حدّث العرض وحالة الرابط قبل أي محاولة جديدة.',
            )
          : proposalError(cause),
      );
    } finally {
      guard.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      if (live.current) setCopied(t('الرابط اتنسخ. جاهز تبعته للعميل.'));
    } catch {
      if (!live.current) return;
      input.current?.focus();
      input.current?.select();
      setCopied(t('حددنا الرابط. انسخه من الحقل.'));
    }
  }
  return (
    <section
      className="proposal-sharing"
      aria-labelledby="proposal-sharing-title"
    >
      <div className="proposal-share-heading">
        <div>
          <span className="form-eyebrow">{t('الخطوة الجاية')}</span>
          <h2 id="proposal-sharing-title">{t('مشاركة العرض')}</h2>
          <p>
            {state?.share?.allowResponse === false
              ? t('الرابط الحالي للقراءة فقط. تجديده هيسمح بالقبول والرفض.')
              : t('رابط للمراجعة والقبول أو الرفض، من غير حساب للعميل.')}
          </p>
        </div>
        <ShieldCheck size={23} aria-hidden="true" />
      </div>
      {!state && !error && (
        <p role="status" className="field-help">
          {t('بنراجع حالة المشاركة…')}{' '}
        </p>
      )}
      {state && (
        <div className="proposal-share-state">
          <span className="proposal-status">
            {state.share
              ? t(stateLabels[state.share.state])
              : t('لسه خاص بمساحتك')}
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
        <p role="alert" className="form-notice">
          {t(
            'العرض اتغيّر من مكان تاني. حدّثه وراجع آخر نسخة قبل المشاركة.',
          )}{' '}
        </p>
      )}
      {error && (
        <p role="alert" className="form-notice">
          {t(error)}
        </p>
      )}
      {(stale || blocked || (!state && error)) && (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={reload}
        >
          {t('تحديث العرض وحالة الرابط')}{' '}
        </button>
      )}
      {canIssue && (
        <>
          <div className="proposal-share-controls">
            <div>
              <label htmlFor="proposal-share-days">{t('صلاحية الرابط')}</label>
              <Select
                id="proposal-share-days"
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
              disabled={!ready || (proposal.status === 'draft' && !reviewed)}
              onClick={() => void mutate('issue')}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Link2 size={17} />
              )}
              {proposal.status === 'draft'
                ? t('إنشاء رابط مشاركة')
                : t('تجديد رابط المشاركة')}
            </button>
            {state?.share && state.share.state !== 'revoked' && (
              <button
                type="button"
                className="button"
                disabled={!ready}
                onClick={() => void mutate('revoke')}
              >
                <X size={16} />
                {t('إلغاء الرابط')}{' '}
              </button>
            )}
          </div>
          {proposal.status === 'draft' && (
            <label className="proposal-share-confirm">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={!ready}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              <span>
                {t(
                  'راجعت العرض وجاهز للمشاركة. بعد إنشاء الرابط، البنود والأسعار هتفضل ثابتة، والعميل هيقدر يقبل العرض أو يرفضه.',
                )}{' '}
              </span>
            </label>
          )}
        </>
      )}
      {!canIssue && state?.share && state.share.state !== 'revoked' && (
        <button
          type="button"
          className="button"
          disabled={!ready}
          onClick={() => void mutate('revoke')}
        >
          {t('إلغاء الرابط')}{' '}
        </button>
      )}
      {link ? (
        <div className="proposal-share-link">
          <label htmlFor="proposal-share-url">{t('رابط العميل')}</label>
          <div>
            <input
              id="proposal-share-url"
              ref={input}
              type="text"
              dir="ltr"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="button"
              onClick={() => void copy()}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
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
                'احفظ الرابط عندك؛ بعد مغادرة الصفحة هتحتاج تجديده لو مش معاك.',
              )}
          </p>
        </div>
      ) : (
        state?.share?.state === 'active' &&
        !blocked && (
          <p className="field-help">
            {t(
              'لو الرابط مش معاك، جدده وخد نسخة جديدة. الرابط السابق هيتوقف.',
            )}{' '}
          </p>
        )
      )}
      <p className="proposal-share-note">
        {state?.share?.allowResponse === false
          ? t('أي حد معاه الرابط الحالي يقدر يراجع العرض طول مدة الصلاحية.')
          : t(
              'أي حد معاه الرابط يقدر يشوف العرض ويقبل أو يرفض طول مدة الصلاحية.',
            )}{' '}
        {t('انسخه وابعته للعميل؛ إنشاء الرابط مش بيبعت رسالة.')}{' '}
      </p>
    </section>
  );
}
