import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { requestLanguage } from '../i18n/request-locale';
import { translate } from '../i18n/translate';
import { LandingEntry } from '../features/landing/components/landing-entry';
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

export default async function HomePage() {
  const cookieStore = await cookies();
  const hasSessionCookie =
    cookieStore.has('__Host-lancelio_refresh') ||
    cookieStore.has('lancelio_refresh');
  return (
    <LandingEntry
      key={hasSessionCookie ? 'returning' : 'visitor'}
      hasSessionCookie={hasSessionCookie}
    />
  );
}
