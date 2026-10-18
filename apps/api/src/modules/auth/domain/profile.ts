import { ApplicationError } from '../../../shared/domain/application-error.js';
import { isValidDisplayName } from './display-name.js';

export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly version: number;
}

export function validateProfileChange(input: {
  name: string;
  version: number;
}) {
  const name = input.name.trim();
  if (!isValidDisplayName(name))
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid display name', {
      name: 'Name must contain 2 to 100 Unicode characters',
    });
  if (
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    input.version >= Number.MAX_SAFE_INTEGER
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid profile version');
  return { name, version: input.version };
}
