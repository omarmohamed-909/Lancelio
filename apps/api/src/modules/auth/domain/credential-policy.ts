// Support conventional ASCII mailboxes; preserve dots and plus aliases.
const emailPattern =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
export function isValidEmail(email: string) {
  return (
    email.length <= 254 &&
    (email.split('@')[0]?.length ?? 0) <= 64 &&
    emailPattern.test(email)
  );
}
export function isValidNewPassword(password: string) {
  const length = Array.from(password).length;
  return length >= 15 && length <= 128;
}
