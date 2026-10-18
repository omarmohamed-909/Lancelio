import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';
import type { Metadata } from 'next';
import { AuthShell } from '../../features/auth/components/auth-shell';
import { RegisterForm } from '../../features/auth/components/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'إنشاء حساب | Lancelio') };
}
export default function RegisterPage() {
  return (
    <AuthShell>
      <RegisterForm />
    </AuthShell>
  );
}
