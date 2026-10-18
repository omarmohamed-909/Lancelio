'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useState } from 'react';
import {
  usePublicDocumentLocation,
  useGrantedDocument,
} from '../../../shared/hooks/use-public-document';
import { LockKeyhole } from 'lucide-react';
import { BrandMark } from '../../../components/ui/brand';
import { LanguageSelect } from '../../../components/language/language-select';
import { sharingApi } from '../services/proposal-sharing-api';
import { ProposalDocument } from './proposal-document';
import { ProposalResponse } from './proposal-response';
import type {
  DecisionAttempt,
  DecisionResult,
} from '../schemas/proposal-decision';
export function PublicProposalScreen() {
  const { t } = useI18n();
  const { token, revision, reload } = usePublicDocumentLocation();
  const [attempt, setAttempt] = useState<DecisionAttempt | null>(null);
  return (
    <main id="main-content" className="public-proposal-shell">
      <header className="public-proposal-brand">
        <span className="document-wordmark" aria-label="Lancelio">
          <BrandMark />
          <span lang="en" dir="ltr">
            lancelio.
          </span>
        </span>
        <LanguageSelect />
        <span>
          <LockKeyhole size={14} aria-hidden="true" />
          {t('عرض للمراجعة')}{' '}
        </span>
      </header>
      {token === null ? (
        <p role="status" className="proposal-state">
          {t('بنفتح ورقة العرض…')}{' '}
        </p>
      ) : (
        <LoadPublic
          key={token + ':' + revision}
          token={token}
          reload={reload}
          attempt={attempt}
          remember={setAttempt}
        />
      )}
      <footer className="public-proposal-footer">
        {t('تفاصيل واضحة، واتفاق مرتب.')}{' '}
      </footer>
    </main>
  );
}
function LoadPublic({
  token,
  reload,
  attempt,
  remember,
}: {
  token: string;
  reload: () => void;
  attempt: DecisionAttempt | null;
  remember: (attempt: DecisionAttempt) => void;
}) {
  const { t, intlLocale } = useI18n();
  const {
    data: proposal,
    setData: setProposal,
    failure,
  } = useGrantedDocument(token, reload, sharingApi.readPublic);
  if (failure)
    return (
      <section className="proposal-state public-proposal-unavailable">
        <LockKeyhole size={28} aria-hidden="true" />
        <h1>
          {failure === 'unavailable'
            ? t('الرابط غير متاح')
            : t('مش قادرين نفتح العرض دلوقتي')}
        </h1>
        <p role="alert">
          {failure === 'unavailable'
            ? t('ممكن صلاحيته انتهت أو صاحب العرض ألغاه. اطلب منه رابط جديد.')
            : t('راجع اتصالك وحاول تاني.')}
        </p>
        {failure === 'network' && (
          <button className="button" type="button" onClick={reload}>
            {t('إعادة المحاولة')}{' '}
          </button>
        )}
      </section>
    );
  if (!proposal)
    return (
      <p role="status" className="proposal-state">
        {t('بنفتح ورقة العرض…')}{' '}
      </p>
    );
  function decided(result: DecisionResult) {
    setProposal((current) =>
      current
        ? {
            ...current,
            status: result.status,
            canRespond: false,
            decision: { outcome: result.status, at: result.decidedAt },
          }
        : null,
    );
  }
  return (
    <>
      <ProposalDocument
        proposal={proposal}
        senderName={proposal.senderName}
        metadata={
          <>
            <span className="form-eyebrow">{t('الرابط صالح حتى')}</span>
            <p>
              {new Intl.DateTimeFormat(intlLocale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(proposal.expiresAt))}
            </p>
          </>
        }
        footer={
          proposal.canRespond
            ? t('راجع الاتفاق، وبعدها أكد قرارك تحت.')
            : t('لو عندك سؤال عن العرض، تواصل مع صاحبه.')
        }
      />
      <ProposalResponse
        proposal={proposal}
        token={token}
        attempt={attempt}
        remember={remember}
        onDecided={decided}
        reload={reload}
      />
    </>
  );
}
