import { localeTag } from './locale';
import type { Locale } from './locale';

const nouns = {
  clients: {
    en: ['client', 'clients'],
    ar: ['عميل واحد', 'عميلان', 'عملاء', 'عميلًا', 'عميل'],
  },
  items: {
    en: ['item', 'items'],
    ar: ['بند واحد', 'بندان', 'بنود', 'بندًا', 'بند'],
  },
  tasks: {
    en: ['task', 'tasks'],
    ar: ['مهمة واحدة', 'مهمتان', 'مهام', 'مهمة', 'مهمة'],
  },
  results: {
    en: ['result', 'results'],
    ar: ['نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة', 'نتيجة'],
  },
} as const;
export type CountKind = keyof typeof nouns;

export function formatCount(locale: Locale, kind: CountKind, count: number) {
  const category = new Intl.PluralRules(localeTag(locale)).select(count);
  const formatted = new Intl.NumberFormat(localeTag(locale)).format(count);
  if (locale === 'en')
    return formatted + ' ' + nouns[kind].en[category === 'one' ? 0 : 1];
  const words = nouns[kind].ar;
  if (category === 'one') return words[0];
  if (category === 'two') return words[1];
  return (
    formatted +
    ' ' +
    words[
      category === 'zero' || category === 'few'
        ? 2
        : category === 'many'
          ? 3
          : 4
    ]
  );
}
