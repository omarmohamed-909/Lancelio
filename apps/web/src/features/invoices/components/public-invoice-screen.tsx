'use client';
import { useI18n } from '../../../i18n/language-provider';

import { LockKeyhole } from 'lucide-react';
import { BrandMark } from '../../../components/ui/brand';
import { LanguageSelect } from '../../../components/language/language-select';
import {
  usePublicDocumentLocation,
  useGrantedDocument,
} from '../../../shared/hooks/use-public-document';
import { PricedDocument } from '../../../shared/components/priced-document';
import { invoiceSharingApi } from '../services/invoice-sharing-api';
export function PublicInvoiceScreen() {
  const { t } = useI18n();
  const { token, revision, reload } = usePublicDocumentLocation();
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
          {t('فاتورة للقراءة')}{' '}
        </span>
      </header>
      {token === null ? (
        <p className="proposal-state" role="status">
          {t('بنفتح الفاتورة…')}{' '}
        </p>
      ) : (
        <Load key={token + ':' + revision} token={token} reload={reload} />
      )}
      <footer className="public-proposal-footer">
        {t('كل بند واضح، ونسخة محفوظة.')}{' '}
      </footer>
    </main>
  );
}
function Load({ token, reload }: { token: string; reload: () => void }) {
  const { t, intlLocale } = useI18n();
  const { data: invoice, failure } = useGrantedDocument(
    token,
    reload,
    invoiceSharingApi.readPublic,
  );
  if (failure)
    return (
      <section className="proposal-state public-proposal-unavailable">
        <LockKeyhole size={28} aria-hidden="true" />
        <h1>
          {failure === 'unavailable'
            ? t('الرابط غير متاح')
            : t('مش قادرين نفتح الفاتورة دلوقتي')}
        </h1>
        <p role="alert">
          {failure === 'unavailable'
            ? t(
                'ممكن صلاحيته انتهت أو صاحب الفاتورة ألغاه. اطلب منه رابط جديد.',
              )
            : t('راجع اتصالك وحاول تاني.')}
        </p>
        {failure === 'network' && (
          <button className="button" type="button" onClick={reload}>
            {t('إعادة المحاولة')}{' '}
          </button>
        )}
      </section>
    );
  if (!invoice)
    return (
      <p className="proposal-state" role="status">
        {t('بنفتح الفاتورة…')}{' '}
      </p>
    );
  return (
    <PricedDocument
      document={invoice}
      number={invoice.number}
      eyebrow={t('فاتورة')}
      statusLabel={t('صادرة')}
      caption={t('بنود الفاتورة')}
      totalLabel={t('إجمالي الفاتورة')}
      senderName={invoice.senderName}
      metadata={
        <>
          <p>
            {t('تاريخ الإصدار:')}{' '}
            {new Intl.DateTimeFormat(intlLocale, {
              dateStyle: 'medium',
            }).format(new Date(invoice.issuedAt))}
          </p>
          <span className="form-eyebrow">{t('الرابط صالح حتى')}</span>
          <p>
            {new Intl.DateTimeFormat(intlLocale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(invoice.expiresAt))}
          </p>
        </>
      }
      footer={t('لو عندك سؤال عن الفاتورة، تواصل مع صاحبها.')}
    />
  );
}
