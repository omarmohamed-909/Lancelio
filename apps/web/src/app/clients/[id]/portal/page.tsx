import { requestLanguage } from '../../../../i18n/request-locale';
import { translate } from '../../../../i18n/translate';
import type { Metadata } from 'next';
import { OwnerPortalScreen } from '../../../../features/portal/components/owner-portal-screen';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'بوابة العميل | Lancelio') };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OwnerPortalScreen clientId={id} />;
}
