import type { Locale } from '../../i18n/locale';

// Resolve the language of the question, not names inside a literal search.
// Technical English words inside an Arabic question should still get Arabic.
export function answerLanguage(question: string, fallback: Locale): Locale {
  const text = question.trim().normalize('NFKC').replace(/[أإآ]/gu, 'ا');
  if (/^(?:رد|جاوب|كلمني|اتكلم|اكتب)\s+بالانجليزي/u.test(text)) return 'en';
  if (/^(?:رد|جاوب|كلمني|اتكلم|اكتب)\s+بالعربي/u.test(text)) return 'ar';
  if (
    /^(?:(?:please|hi|hello)[,!]?\s+)?(?:how|what|which|where|when|why|can|could|show|list|find|search|and|all|my|open|completed|on hold|help)\b/iu.test(
      text,
    )
  )
    return 'en';
  if (/(?=\p{Script_Extensions=Arabic})\p{L}/u.test(text)) return 'ar';
  if (/(?=\p{Script=Latin})\p{L}/u.test(text)) return 'en';
  return fallback;
}
