import { ApplicationError } from './application-error.js';
export function validateId(id: string): string {
  if (!/^[a-f0-9]{24}$/iu.test(id))
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid identifier');
  return id.toLowerCase();
}
export function validateVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 1)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid version');
}
