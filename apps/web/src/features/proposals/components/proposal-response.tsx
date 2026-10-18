'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { ApiError } from '../../../shared/api/http-client';
import { sharingApi } from '../services/proposal-sharing-api';
import type { PublicProposal } from '../schemas/proposal-share';
import type {
  DecisionAttempt,
  DecisionChoice,
  DecisionResult,
} from '../schemas/proposal-decision';
export function ProposalResponse({
  proposal,
  token,
  attempt,
  remember,
  onDecided,
  reload,
}: {
  proposal: PublicProposal;
  token: string;
  attempt: DecisionAttempt | null;
  remember: (attempt: DecisionAttempt) => void;
  onDecided: (result: DecisionResult) => void;
  reload: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const [choice, setChoice] = useState<DecisionChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const guard = useRef(false);
  const live = useRef(true);
  const confirm = useRef<HTMLButtonElement>(null);
  const accept = useRef<HTMLButtonElement>(null);
  const reject = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<DecisionChoice | null>(null);
  const retry = attempt?.token === token ? attempt : null;
  const activeChoice = retry?.choice ?? choice;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (activeChoice) confirm.current?.focus();
    else if (returnFocus.current) {
      (returnFocus.current === 'accept' ? accept : reject).current?.focus();
      returnFocus.current = null;
    }
  }, [activeChoice]);
  function cancel() {
    returnFocus.current = choice;
    setChoice(null);
  }
  async function submit() {
    if (
      guard.current ||
      busy ||
      blocked ||
      !activeChoice ||
      !proposal.canRespond
    )
      return;
    guard.current = true;
    setBusy(true);
    setNotice('');
    try {
      const current = retry ?? {
        token,
        choice: activeChoice,
        requestId: crypto.randomUUID(),
      };
      remember(current);
      const result = await sharingApi.decide(
        token,
        current.choice,
        current.requestId,
      );
      if (live.current) onDecided(result);
    } catch (cause: unknown) {
      if (!live.current) return;
      setBlocked(true);
      setNotice(
        cause instanceof ApiError && cause.code === 'PROPOSAL_DECISION_CONFLICT'
          ? t('قرار اتسجل على العرض من مكان تاني. راجع الحالة الحالية.')
          : cause instanceof ApiError && cause.status === 404
            ? t('الرابط مش متاح للرد دلوقتي. راجع حالته.')
            : t(
                'مش قادرين نتأكد إن قرارك وصل. راجع حالة العرض قبل أي محاولة جديدة.',
              ),
      );
    } finally {
      guard.current = false;
      if (live.current) setBusy(false);
    }
  }
  if (proposal.status !== 'sent')
    return (
      <section
        className="proposal-response proposal-response-complete"
        aria-labelledby="proposal-response-title"
        role="status"
      >
        {proposal.status === 'accepted' ? (
          <Check size={22} aria-hidden="true" />
        ) : (
          <X size={22} aria-hidden="true" />
        )}
        <div>
          <h2 id="proposal-response-title">
            {proposal.status === 'accepted'
              ? t('تم قبول العرض')
              : t('تم رفض العرض')}
          </h2>
          <p>
            {proposal.status === 'accepted'
              ? t('قرارك اتسجل، وصاحب العرض يقدر يبدأ متابعة الشغل.')
              : t('قرارك اتسجل. تقدر تتواصل مع صاحب العرض لو محتاج عرض جديد.')}
          </p>
          {proposal.decision && (
            <small>
              {new Intl.DateTimeFormat(intlLocale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(proposal.decision.at))}
            </small>
          )}
        </div>
      </section>
    );
  if (!proposal.canRespond) return null;
  return (
    <section
      className="proposal-response"
      aria-labelledby="proposal-response-title"
    >
      <span className="form-eyebrow">{t('بعد المراجعة')}</span>
      <h2 id="proposal-response-title">{t('قرارك على العرض')}</h2>
      <p>{t('راجع نطاق الشغل والأسعار وشروط الاتفاق قبل ما تأكد قرارك.')}</p>
      {notice && (
        <p className="form-notice" role="alert">
          {t(notice)}
        </p>
      )}
      {blocked ? (
        <button className="button" type="button" onClick={reload}>
          {t('مراجعة حالة العرض')}{' '}
        </button>
      ) : activeChoice ? (
        <div
          className="proposal-response-confirm"
          role="group"
          aria-label={t('تأكيد القرار')}
        >
          <h3>
            {activeChoice === 'accept'
              ? t('تأكيد قبول العرض')
              : t('تأكيد رفض العرض')}
          </h3>
          <p>
            {activeChoice === 'accept'
              ? t(
                  'هتوافق على البنود والأسعار والشروط المذكورة في العرض. القرار نهائي بعد التأكيد.',
                )
              : t('هتسجل رفضك للعرض الحالي. القرار نهائي بعد التأكيد.')}
          </p>
          {retry && (
            <p className="field-help">
              {t('راجعنا حالة العرض. تأكيدك هيكمل نفس المحاولة السابقة.')}{' '}
            </p>
          )}
          <div>
            <button
              ref={confirm}
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              {activeChoice === 'accept'
                ? t('تأكيد قبول العرض')
                : t('تأكيد رفض العرض')}
            </button>
            {!retry && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={cancel}
              >
                {t('الرجوع للمراجعة')}{' '}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="proposal-response-actions">
          <button
            ref={accept}
            className="button button-primary"
            type="button"
            onClick={() => setChoice('accept')}
          >
            <Check size={16} />
            {t('قبول العرض')}{' '}
          </button>
          <button
            ref={reject}
            className="button"
            type="button"
            onClick={() => setChoice('reject')}
          >
            <X size={16} />
            {t('رفض العرض')}{' '}
          </button>
        </div>
      )}
    </section>
  );
}
