import { LegalPage } from '../../../features/legal/components/legal-page';
import { legalMetadata } from '../../../features/legal/metadata';

export const generateMetadata = () => legalMetadata('cookies');

export default function Page() {
  return <LegalPage document="cookies" />;
}
