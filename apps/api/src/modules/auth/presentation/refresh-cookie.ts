import type { CookieOptions, Response } from 'express';

function cookieName(secure: boolean) {
  return secure ? '__Host-lancelio_refresh' : 'lancelio_refresh';
}

function cookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/' };
}

export function readRefreshCookie(
  header: string | undefined,
  secure: boolean,
): string | undefined {
  if (!header || header.length > 8192) return undefined;
  const prefix = `${cookieName(secure)}=`;
  const matches = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix));
  // Ambiguous duplicate cookies are never accepted as credentials.
  return matches.length === 1 ? matches[0]?.slice(prefix.length) : undefined;
}

export function setRefreshCookie(
  response: Response,
  secure: boolean,
  token: string,
  expires: Date,
) {
  response.cookie(cookieName(secure), token, {
    ...cookieOptions(secure),
    expires,
  });
}

export function clearRefreshCookie(response: Response, secure: boolean) {
  response.clearCookie(cookieName(secure), cookieOptions(secure));
}
