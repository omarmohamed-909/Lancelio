export type Locale = 'ar' | 'en';
export type LanguagePreference = Locale | 'auto';
export const languageCookie = 'lancelio_language';

export function languagePreference(value: unknown): LanguagePreference {
  return value === 'ar' || value === 'en' ? value : 'auto';
}

export function negotiateLanguage(header: string | null): Locale {
  const candidates = (header ?? '')
    .slice(0, 2048)
    .split(',')
    .map((part, index) => {
      const [tag = '', ...parameters] = part.trim().split(';');
      const quality = parameters.find((parameter) =>
        parameter.trim().startsWith('q='),
      );
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return { tag: tag.toLowerCase().split('-')[0], q, index };
    })
    .filter(({ q }) => Number.isFinite(q) && q > 0 && q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return (
    (candidates.find(({ tag }) => tag === 'ar' || tag === 'en')?.tag as
      Locale | undefined) ?? 'ar'
  );
}

export function resolveLanguage(
  preference: LanguagePreference,
  header: string | null,
): Locale {
  return preference === 'auto' ? negotiateLanguage(header) : preference;
}
export const localeTag = (locale: Locale) =>
  locale === 'ar' ? 'ar-EG' : 'en-US';
