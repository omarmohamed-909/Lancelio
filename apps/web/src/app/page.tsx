import type { Metadata } from 'next';
import { requestLanguage } from '../i18n/request-locale';
import { translate } from '../i18n/translate';
import { LandingPage } from '../features/landing/components/landing-page';
import './landing.css';

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  const title = translate(locale, 'Lancelio | شغلك كله، في مكانه');
  const description = translate(
    locale,
    'من أول اتفاق لآخر فاتورة. مساحة واحدة لتنظيم عملائك ومشاريعك ومتابعة مستحقاتك، بالعربي والإنجليزي.',
  );
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'ar' ? 'ar_EG' : 'en_US',
    },
    twitter: { card: 'summary', title, description },
  };
}

export default function HomePage() {
  return <LandingPage />;
}
