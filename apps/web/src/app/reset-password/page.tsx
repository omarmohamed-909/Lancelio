import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';
import type { Metadata } from 'next';
import { AuthShell } from '../../features/auth/components/auth-shell';
import { ResetPasswordForm } from '../../features/auth/components/recovery-forms';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return {
    title: translate(locale, 'كلمة مرور جديدة | Lancelio'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}
export default function Page() {
  return (
    <AuthShell variant="login" recovery>
      <ResetPasswordForm />
    </AuthShell>
  );
}
