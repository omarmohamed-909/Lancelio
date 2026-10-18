import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';
import type { Metadata } from 'next';
import { AuthShell } from '../../features/auth/components/auth-shell';
import { LoginForm } from '../../features/auth/components/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return { title: translate(locale, 'تسجيل الدخول | Lancelio') };
}
export default function LoginPage() {
  return (
    <AuthShell variant="login">
      <LoginForm />
    </AuthShell>
  );
}
