'use client';
import { useI18n } from '../../../i18n/language-provider';
import type { ReactNode } from 'react';
import { PricedDocument } from '../../../shared/components/priced-document';
import type { Invoice } from '../schemas/invoice';
export function InvoiceDocument({
  invoice,
  metadata,
  footer,
}: {
  invoice: Invoice;
  metadata: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <PricedDocument
      document={invoice}
      number={invoice.number}
      eyebrow={invoice.status === 'draft' ? t('مسودة فاتورة') : t('فاتورة')}
      statusLabel={invoice.status === 'draft' ? t('مسودة خاصة') : t('صادرة')}
      {...(invoice.senderName ? { senderName: invoice.senderName } : {})}
      caption={t('بنود الفاتورة')}
      totalLabel={t('إجمالي الفاتورة')}
      metadata={metadata}
      footer={footer}
    />
  );
}
