import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';
import type { Metadata } from 'next';
import { WorkspaceShell } from '../../features/workspace/components/workspace-shell';
import { ClientsScreen } from '../../features/clients/components/clients-screen';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'دفتر العملاء | Lancelio') };
}
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; new?: string }>;
}) {
  const query = await searchParams;
  const clientId =
    typeof query.client === 'string' && /^[a-f\d]{24}$/u.test(query.client)
      ? query.client
      : undefined;
  const create = query.new === '1';
  return (
    <WorkspaceShell>
      <ClientsScreen
        key={clientId ?? (create ? 'create' : 'list')}
        clientId={clientId}
        create={create}
      />
    </WorkspaceShell>
  );
}
