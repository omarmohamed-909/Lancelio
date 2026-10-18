import 'server-only';
import { cookies, headers } from 'next/headers';
import { languageCookie, languagePreference, resolveLanguage } from './locale';

export async function requestLanguage() {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const preference = languagePreference(cookieStore.get(languageCookie)?.value);
  return {
    preference,
    locale: resolveLanguage(preference, requestHeaders.get('accept-language')),
  };
}
