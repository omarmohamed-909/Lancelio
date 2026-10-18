import { requestLanguage } from '../../../i18n/request-locale';
import { translate } from '../../../i18n/translate';
import type { Metadata } from 'next';
import { PublicProposalScreen } from '../../../features/proposals/components/public-proposal-screen';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return {
    title: translate(locale, 'عرض سعر | Lancelio'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}
export default function SharedProposalPage() {
  return <PublicProposalScreen />;
}
