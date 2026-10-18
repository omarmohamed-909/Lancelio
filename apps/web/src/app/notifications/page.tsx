import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';
import type { Metadata } from 'next';
import { NotificationsScreen } from '../../features/notifications/components/notifications-screen';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'الإشعارات | Lancelio') };
}
export default function NotificationsPage() {
  return <NotificationsScreen />;
}
