import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';
import type { Metadata } from 'next';
import { SettingsScreen } from '../../features/settings/components/settings-screen';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'الإعدادات | Lancelio') };
}
export default function SettingsPage() {
  return <SettingsScreen />;
}
