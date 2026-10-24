import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AccountPortalScreen } from '../../../features/portal/components/connections-screen';
export const metadata: Metadata = {
  title: 'Lancelio | Client portal',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function AccountPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-f\d]{24}$/u.test(id)) notFound();
  return <AccountPortalScreen id={id} />;
}
