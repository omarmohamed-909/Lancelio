import type { Metadata } from 'next';
import { ConnectionsScreen } from '../../features/portal/components/connections-screen';
export const metadata: Metadata = {
  title: 'Lancelio | Connections',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function ConnectionsPage() {
  return <ConnectionsScreen />;
}
