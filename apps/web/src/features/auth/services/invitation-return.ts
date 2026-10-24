const key = 'lancelio.client-invitation';
export function pendingInvitation() {
  try {
    const value = sessionStorage.getItem(key);
    return value && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}
export function rememberInvitation(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* The link remains usable in this tab. */
  }
}
export function clearInvitation() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function afterSignInPath() {
  return pendingInvitation() ? '/connections' : '/dashboard';
}
