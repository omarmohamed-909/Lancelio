'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  languageCookie,
  languagePreference,
  localeTag,
  negotiateLanguage,
} from './locale';
import type { LanguagePreference, Locale } from './locale';
import { translate } from './translate';
import { formatCount } from './counts';
import type { CountKind } from './counts';

interface Language {
  locale: Locale;
  preference: LanguagePreference;
  changeLanguage: (value: LanguagePreference) => void;
}
const LanguageContext = createContext<Language | null>(null);

export function LanguageProvider({
  children,
  initialLocale,
  initialPreference,
}: {
  children: ReactNode;
  initialLocale: Locale;
  initialPreference: LanguagePreference;
}) {
  const router = useRouter();
  const [locale, setLocale] = useState(initialLocale);
  const [preference, setPreference] = useState(initialPreference);
  const changeLanguage = useCallback(
    (value: LanguagePreference) => {
      const valid = languagePreference(value);
      setPreference(valid);
      setLocale(
        valid === 'auto'
          ? negotiateLanguage(navigator.languages.join(','))
          : valid,
      );
      try {
        document.cookie = `${languageCookie}=${valid};Path=/;Max-Age=31536000;SameSite=Lax${location.protocol === 'https:' ? ';Secure' : ''}`;
      } catch {
        /* Navigation still works when persistent cookies are unavailable. */
      }
      router.refresh();
    },
    [router],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  useEffect(() => {
    const update = () => {
      if (preference === 'auto')
        setLocale(negotiateLanguage(navigator.languages.join(',')));
    };
    window.addEventListener('languagechange', update);
    return () => window.removeEventListener('languagechange', update);
  }, [preference]);
  const value = useMemo(
    () => ({ locale, preference, changeLanguage }),
    [locale, preference, changeLanguage],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  const t = useCallback(
    (message: string | undefined, values: readonly unknown[] = []) =>
      translate(context.locale, message ?? '', values),
    [context.locale],
  );
  const countText = useCallback(
    (kind: CountKind, count: number) =>
      formatCount(context.locale, kind, count),
    [context.locale],
  );
  return { ...context, t, countText, intlLocale: localeTag(context.locale) };
}
