export function isValidDisplayName(name: string): boolean {
  const length = Array.from(name.trim()).length;
  return length >= 2 && length <= 100;
}
