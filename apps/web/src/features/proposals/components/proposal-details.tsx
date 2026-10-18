'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Pencil } from 'lucide-react';
import { ProposalLoader } from './proposal-loader';
import { ProposalDocument } from './proposal-document';
import { ProposalSharing } from './proposal-sharing';
import type { Proposal } from '../schemas/proposal';
export function ProposalDetails({ id }: { id: string }) {
  return (
    <ProposalLoader id={id}>
      {(proposal, reload) => (
        <Review
          key={proposal.id + ':' + proposal.version}
          initial={proposal}
          reload={reload}
        />
      )}
    </ProposalLoader>
  );
}
function Review({
  initial,
  reload,
}: {
  initial: Proposal;
  reload: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const [proposal, setProposal] = useState(initial);
  return (
    <>
      <div className="proposal-page-bar">
        <Link href="/proposals">
          <ArrowRight size={16} />
          {t('كل العروض')}{' '}
        </Link>
        {proposal.status === 'draft' && (
          <Link
            className="button button-primary"
            href={'/proposals/' + proposal.id + '/edit'}
          >
            <Pencil size={16} />
            {t('تعديل المسودة')}{' '}
          </Link>
        )}
      </div>
      <button
        className="button proposal-refresh-state"
        type="button"
        onClick={reload}
      >
        {t('تحديث حالة العرض')}{' '}
      </button>
      <ProposalDocument
        proposal={proposal}
        metadata={
          <>
            <span className="form-eyebrow">{t('آخر تعديل')}</span>
            <p>
              {new Intl.DateTimeFormat(intlLocale, {
                dateStyle: 'medium',
              }).format(new Date(proposal.updatedAt))}
            </p>
            <span className="field-help">
              {t('نسخة')} {proposal.version}
            </span>
          </>
        }
        footer={
          proposal.status === 'draft'
            ? t('مسودة محفوظة. لم يتم إرسالها للعميل بعد.')
            : t(
                'محتوى العرض ثابت بعد مشاركته. إنشاء الرابط لا يرسل رسالة للعميل.',
              )
        }
      />
      {proposal.decision && (
        <section className="proposal-decision-status">
          <span className="proposal-status">
            {proposal.decision.outcome === 'accepted'
              ? t('العميل قبل العرض')
              : t('العميل رفض العرض')}
          </span>
          <p>
            {t('اتسجل القرار')}{' '}
            {new Intl.DateTimeFormat(intlLocale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(proposal.decision.at))}
          </p>
          {proposal.projectId && (
            <Link
              className="button button-primary"
              href={'/projects/' + proposal.projectId}
            >
              {t('افتح المشروع')}{' '}
            </Link>
          )}
        </section>
      )}
      <ProposalSharing
        proposal={proposal}
        reload={reload}
        onChanged={(state) =>
          setProposal((current) => ({
            ...current,
            version: state.proposalVersion,
            status: state.proposalStatus,
            updatedAt: state.updatedAt,
          }))
        }
      />
    </>
  );
}
