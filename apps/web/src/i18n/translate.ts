import type { Locale } from './locale';
import { en } from './messages/en';
import type { ar } from './messages/ar';

const checked: Record<keyof typeof ar, string> = en;
const reverse = new Map(
  Object.entries(checked).map(([key, value]) => [value, key]),
);

export function translate(
  locale: Locale,
  message: string,
  values: readonly unknown[] = [],
): string {
  const key = message.trim().replace(/\s+/gu, ' ');
  const source = reverse.get(key) ?? key;
  const translated =
    locale === 'ar' ? reverse.get(key) : checked[source as keyof typeof ar];
  const result =
    translated === undefined
      ? message
      : (message.match(/^\s+/u)?.[0] ?? '') +
        translated +
        (message.match(/\s+$/u)?.[0] ?? '');
  return result.replace(/\{(\d+)\}/gu, (placeholder, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : placeholder,
  );
}
