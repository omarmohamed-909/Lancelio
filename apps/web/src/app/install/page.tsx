import type { Metadata } from 'next';
import { InstallPage } from '../../features/pwa/components/install-page';
import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return {
    title: `${translate(locale, 'تثبيت التطبيق')} | Lancelio`,
    description: translate(
      locale,
      'افتح مساحة شغلك من الشاشة الرئيسية، في نافذة مستقلة وبحسابك المعتاد.',
    ),
  };
}
export default function Page() {
  return <InstallPage />;
}
