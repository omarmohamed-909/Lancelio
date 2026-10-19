'use client';
import { useI18n } from '../../i18n/language-provider';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';
import { useHydrated } from '../../shared/hooks/use-hydrated';

export function ThemeToggle() {
  const { t } = useI18n();
  const { resolved, setTheme } = useTheme();
  const ready = useHydrated();
  const dark = resolved === 'dark';
  const label = dark ? t('تفعيل الوضع الفاتح') : t('تفعيل الوضع الداكن');
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={t(label)}
      title={t(label)}
      disabled={!ready}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? (
        <Sun size={19} aria-hidden="true" />
      ) : (
        <Moon size={19} aria-hidden="true" />
      )}
    </button>
  );
}
