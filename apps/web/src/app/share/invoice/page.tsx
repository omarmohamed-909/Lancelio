import { requestLanguage } from '../../../i18n/request-locale';
import { translate } from '../../../i18n/translate';
import type { Metadata } from 'next';
import { PublicInvoiceScreen } from '../../../features/invoices/components/public-invoice-screen';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return {
    title: translate(locale, 'فاتورة | Lancelio'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}
export default function Page() {
  return <PublicInvoiceScreen />;
}
