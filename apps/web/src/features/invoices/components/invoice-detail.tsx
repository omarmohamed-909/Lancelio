'use client';
import { useI18n } from '../../../i18n/language-provider';

import { InvoicePayments } from '../../payments/components/invoice-payments';
import { useState } from 'react';
import Link from 'next/link';
import { InvoiceLoader } from './invoice-loader';
import { InvoiceDocument } from './invoice-document';
import { InvoiceIssue } from './invoice-issue';
import { InvoiceSharing } from './invoice-sharing';
import type { Invoice } from '../schemas/invoice';
export function InvoiceDetail({ id }: { id: string }) {
  return (
    <InvoiceLoader id={id}>
      {(invoice, reload) => (
        <Review
          key={invoice.id + ':' + invoice.version}
          saved={invoice}
          reload={reload}
        />
      )}
    </InvoiceLoader>
  );
}
function Review({ saved, reload }: { saved: Invoice; reload: () => void }) {
  const { t, intlLocale } = useI18n();
  const [invoice, setInvoice] = useState(saved);
  return (
    <>
      <div className="proposal-page-bar">
        <Link href="/invoices">{t('كل الفواتير')}</Link>
        {invoice.status === 'draft' ? (
          <Link className="button" href={'/invoices/' + invoice.id + '/edit'}>
            {t('تعديل المسودة')}{' '}
          </Link>
        ) : (
          <span className="proposal-status">
            {t('فاتورة صادرة · البنود ثابتة')}
          </span>
        )}
      </div>
      <InvoiceDocument
        invoice={invoice}
        metadata={
          <>
            <p>
              {invoice.issuedAt ? t('تاريخ الإصدار: ') : t('تاريخ الحفظ: ')}
              {new Intl.DateTimeFormat(intlLocale, {
                dateStyle: 'medium',
              }).format(new Date(invoice.issuedAt ?? invoice.createdAt))}
            </p>
            {invoice.project && (
              <Link
                className="invoice-project-link"
                href={'/projects/' + invoice.project.id}
              >
                {t('المشروع:')} {invoice.project.title}
              </Link>
            )}
          </>
        }
        footer={
          <p>
            {invoice.status === 'draft'
              ? t('مسودة خاصة، راجعها قبل الإصدار.')
              : t(
                  'الفاتورة صادرة وبياناتها ثابتة. الدفعات بتتسجل في سجل منفصل.',
                )}
          </p>
        }
      />
      <InvoicePayments key={invoice.status} invoiceId={invoice.id} />
      {invoice.status === 'draft' ? (
        <InvoiceIssue invoice={invoice} onSaved={setInvoice} reload={reload} />
      ) : (
        <InvoiceSharing
          invoice={invoice}
          onChanged={(state) =>
            setInvoice((current) => ({
              ...current,
              version: state.invoiceVersion,
              updatedAt: state.updatedAt,
            }))
          }
          reload={reload}
        />
      )}
    </>
  );
}
