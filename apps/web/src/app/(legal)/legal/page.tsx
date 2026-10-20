import { LegalPage } from '../../../features/legal/components/legal-page';
import { legalMetadata } from '../../../features/legal/metadata';

export const generateMetadata = () => legalMetadata();

export default function Page() {
  return <LegalPage />;
}
