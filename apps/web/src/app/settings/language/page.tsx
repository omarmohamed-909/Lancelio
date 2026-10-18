import { SettingsScreen } from '../../../features/settings/components/settings-screen';
import { requestLanguage } from '../../../i18n/request-locale';
import { translate } from '../../../i18n/translate';
import type { Metadata } from 'next';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'اللغة والمنطقة') + ' | Lancelio' };
}
export default function LanguageSettingsPage() {
  return <SettingsScreen section="language" />;
}
