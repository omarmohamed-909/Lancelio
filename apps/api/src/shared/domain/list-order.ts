import { ApplicationError } from './application-error.js';

export type ListOrder = 'newest' | 'oldest';

export function validateListOrder(value: string = 'newest'): ListOrder {
  if (value === 'newest' || value === 'oldest') return value;
  throw new ApplicationError('VALIDATION_ERROR', 'Invalid list order');
}
