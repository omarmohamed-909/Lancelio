import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import '../styles/tokens.css';
import './globals.css';
import './auth.css';
import './workspace.css';
import './dashboard.css';
import './portal.css';
import './notifications.css';
import './settings.css';
import './clients.css';
import './proposals.css';
import './motion.css';
import './projects.css';
import './tasks.css';
import './invoices.css';
import './responsive.css';
import './feedback.css';
import './workspace-actions.css';
import './list-preferences.css';
import './theme.css';
import './select.css';
import './language.css';
import './assistant.css';
import './pwa.css';
import { requestLanguage } from '../i18n/request-locale';
import { LanguageProvider } from '../i18n/language-provider';
import { ThemeProvider } from '../components/theme/theme-provider';
import { themeScript } from '../components/theme/theme-script';
import { FeedbackProvider } from '../components/ui/feedback-provider';
import { SkipLink } from '../components/ui/skip-link';
import { SessionBoundary } from '../features/auth/components/session-boundary';
import { PwaProvider } from '../features/pwa/components/pwa-provider';

const interfaceFont = localFont({
  src: [
    {
      path: '../styles/fonts/IBMPlexSansArabic-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../styles/fonts/IBMPlexSansArabic-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../styles/fonts/IBMPlexSansArabic-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-interface',
  display: 'swap',
  fallback: ['Tahoma', 'Arial'],
});

export const metadata: Metadata = {
  title: 'Lancelio',
  description: 'Run your freelance business from one place.',
  applicationName: 'Lancelio',
  appleWebApp: { capable: true, title: 'Lancelio', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#173d30' };

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { locale, preference } = await requestLanguage();
  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className={interfaceFont.variable}
      suppressHydrationWarning
    >
      <head>
        {/* The saved appearance is applied before paint; only html's theme attribute differs. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Extensions can inject body attributes before hydration; child checks stay active. */}
      <body suppressHydrationWarning>
        <LanguageProvider initialLocale={locale} initialPreference={preference}>
          <SkipLink />
          <ThemeProvider>
            <PwaProvider>
              <FeedbackProvider>
                <SessionBoundary>{children}</SessionBoundary>
              </FeedbackProvider>
            </PwaProvider>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
