import { requestLanguage } from '../../../i18n/request-locale';
import { translate } from '../../../i18n/translate';
import type { Metadata } from 'next';
import { SettingsScreen } from '../../../features/settings/components/settings-screen';

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'مظهر الموقع | Lancelio') };
}
export default function AppearancePage() {
  return <SettingsScreen section="appearance" />;
}
