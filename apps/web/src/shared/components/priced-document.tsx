'use client';
import { useI18n } from '../../i18n/language-provider';
import type { ReactNode } from 'react';
import { BrandMark } from '../../components/ui/brand';
import { formatMoney } from '../money';
import { PricedTable } from './priced-table';
export interface PricedDocumentContent {
  title: string;
  summary: string;
  terms: string;
  currency: string;
  items: readonly {
    title: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
  }[];
  totalMinor: number;
  client: { name: string; company: string; email?: string; phone?: string };
}
export function PricedDocument({
  document,
  eyebrow,
  statusLabel,
  number,
  caption,
  totalLabel,
  metadata,
  footer,
  senderName,
}: {
  document: PricedDocumentContent;
  eyebrow: string;
  statusLabel: string;
  number?: string;
  caption: string;
  totalLabel: string;
  metadata: ReactNode;
  footer: ReactNode;
  senderName?: string;
}) {
  const { t, intlLocale } = useI18n();
  return (
    <article className="proposal-paper proposal-review">
      <header className="proposal-document-header">
        <div>
          <span className="form-eyebrow">
            {t(eyebrow)} · {document.currency}
          </span>
          {number && (
            <span className="invoice-number" dir="ltr">
              {number}
            </span>
          )}
          <h1>{document.title}</h1>
          <span className="proposal-status">{t(statusLabel)}</span>
        </div>
        <div className="document-wordmark" aria-hidden="true">
          <BrandMark />
          <span lang="en" dir="ltr">
            lancelio.
          </span>
        </div>
      </header>
      {senderName && (
        <p className="proposal-sender">
          {t('مقدّم من')} <strong>{senderName}</strong>
        </p>
      )}
      <section className="proposal-recipient">
        <div>
          <span className="form-eyebrow">{t('مقدّم إلى')}</span>
          <h2>{document.client.name}</h2>
          {document.client.company && <p>{document.client.company}</p>}
          {document.client.email && <p dir="ltr">{document.client.email}</p>}
          {document.client.phone && <p dir="ltr">{document.client.phone}</p>}
        </div>
        <div>{metadata}</div>
      </section>
      {document.summary && (
        <section className="proposal-copy">
          <h2>{t('نطاق الشغل')}</h2>
          <p>{document.summary}</p>
        </section>
      )}
      <PricedTable label={t(caption) + t('، جدول قابل للتمرير')}>
        <table className="proposal-table">
          <caption>{t(caption)}</caption>
          <thead>
            <tr>
              <th scope="col">{t('البند')}</th>
              <th scope="col">{t('الكمية')}</th>
              <th scope="col">{t('سعر الوحدة')}</th>
              <th scope="col">{t('الإجمالي')}</th>
            </tr>
          </thead>
          <tbody>
            {document.items.map((item, index) => (
              <tr key={index}>
                <th scope="row">{item.title}</th>
                <td>{item.quantity}</td>
                <td>
                  {formatMoney(
                    item.unitPriceMinor,
                    document.currency,
                    intlLocale,
                  )}
                </td>
                <td>
                  {formatMoney(item.totalMinor, document.currency, intlLocale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PricedTable>
      <div className="proposal-final-total">
        <span>{t(totalLabel)}</span>
        <strong>
          {formatMoney(document.totalMinor, document.currency, intlLocale)}
        </strong>
      </div>
      {document.terms && (
        <section className="proposal-copy">
          <h2>{t('شروط الاتفاق')}</h2>
          <p>{document.terms}</p>
        </section>
      )}
      <footer className="proposal-document-footer">{footer}</footer>
    </article>
  );
}
