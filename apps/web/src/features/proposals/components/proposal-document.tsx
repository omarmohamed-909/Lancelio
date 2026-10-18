'use client';
import { useI18n } from '../../../i18n/language-provider';
import type { ReactNode } from 'react';
import { PricedDocument } from '../../../shared/components/priced-document';
import type { PricedDocumentContent } from '../../../shared/components/priced-document';
import { statusLabels } from '../services/proposal-api';
import type { Proposal } from '../schemas/proposal';
export function ProposalDocument({
  proposal,
  metadata,
  footer,
  senderName,
}: {
  proposal: PricedDocumentContent & Pick<Proposal, 'status'>;
  metadata: ReactNode;
  footer: ReactNode;
  senderName?: string;
}) {
  const { t } = useI18n();
  return (
    <PricedDocument
      document={proposal}
      eyebrow={t('عرض سعر')}
      statusLabel={statusLabels[proposal.status]}
      caption={t('بنود العرض')}
      totalLabel={t('إجمالي العرض')}
      metadata={metadata}
      footer={footer}
      {...(senderName ? { senderName } : {})}
    />
  );
}
