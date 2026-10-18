import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';
import type { Metadata } from 'next';
import { WorkspaceDashboard } from '../../features/dashboard/components/workspace-dashboard';

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'مساحة العمل | Lancelio') };
}
export default function DashboardPage() {
  return <WorkspaceDashboard />;
}
