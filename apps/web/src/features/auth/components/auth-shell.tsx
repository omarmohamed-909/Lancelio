'use client';
import { useI18n } from '../../../i18n/language-provider';
import type { ReactNode } from 'react';
import { Check, ArrowUpLeft } from 'lucide-react';
import { Brand } from '../../../components/ui/brand';
import { ThemeToggle } from '../../../components/theme/theme-toggle';
import { LanguageSelect } from '../../../components/language/language-select';
import { LegalLinks } from '../../legal/components/legal-links';
export function AuthShell({
  children,
  variant = 'register',
  recovery = false,
}: {
  children: ReactNode;
  variant?: 'login' | 'register';
  recovery?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`auth-shell auth-shell-${variant}${recovery ? ' auth-shell-recovery' : ''}`}
    >
      <aside className="auth-story">
        <div className="auth-story-brand">
          <Brand light />
          <span>{t('مساحة للشغل المستقل')}</span>
        </div>
        <div className="story-content">
          <span className="eyebrow">
            <span className="story-index" dir="ltr">
              01 — 03
            </span>{' '}
            {t('كل مرحلة في مكانها')}{' '}
          </span>
          <h2>
            {t('اتفاق واضح.')} <br />
            {t('شغل مرتب.')} <br />
            <span>{t('وبالك أهدى.')}</span>
          </h2>
          <p>
            {t('من أول كلام مع العميل لحد التسليم.')} <br />
            {t('التفاصيل قريبة، والخطوة الجاية واضحة.')}{' '}
          </p>
          <div className="desk-scene" aria-hidden="true">
            <div className="desk-paper desk-quote">
              <div className="paper-topline">
                <span>{t('دفتر الاتفاقات')}</span>
                <span dir="ltr">L / 01</span>
              </div>
              <strong>
                {t('كل شغل يبدأ')} <br />
                {t('باتفاق.')}{' '}
              </strong>
              <div className="paper-rule" />
              <div className="paper-rule short" />
              <div className="paper-footer">
                <span>{t('العميل · نطاق الشغل · السعر')}</span>
                <span className="paper-signature">lancelio</span>
              </div>
            </div>
            <div className="desk-paper desk-project">
              <span className="paper-index" dir="ltr">
                02
              </span>
              <strong>{t('خطوة بخطوة')}</strong>
              <span className="paper-task">
                <Check size={14} />
                {t('نطاق واضح')}{' '}
              </span>
              <span className="paper-task">
                <Check size={14} />
                {t('تسليم مرتب')}{' '}
              </span>
            </div>
            <div className="desk-paper desk-invoice">
              <span className="paper-index" dir="ltr">
                03 / IN ORDER
              </span>
              <span>{t('والتفاصيل محفوظة.')}</span>
              <ArrowUpLeft size={19} />
            </div>
          </div>
        </div>
        <footer>
          <span>{t('للأفكار اللي بتتحوّل لشغل.')}</span>
          <span lang="en" dir="ltr">
            WORK, IN ORDER.
          </span>
        </footer>
      </aside>
      <main id="main-content" className="auth-main">
        <div className="auth-appearance">
          <div className="mobile-brand">
            <Brand />
          </div>
          <LanguageSelect />
          <ThemeToggle />
        </div>
        <div className="auth-form-wrap">{children}</div>
        <footer className="auth-footer">
          <span>{t('Lancelio · مساحة لشغلك، على طريقتك.')}</span>
          <LegalLinks />
        </footer>
      </main>
    </div>
  );
}
