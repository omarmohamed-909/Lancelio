import { validateListOrder } from '../../../shared/domain/list-order.js';
import type { ListOrder } from '../../../shared/domain/list-order.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from './client.js';
export type ContactFilter = 'all' | 'email' | 'phone' | 'none';
export interface ClientListInput {
  order?: string | undefined;
  archived: boolean;
  search?: string;
  contact?: ContactFilter;
  cursor?: string;
}
export interface ClientListQuery {
  order: ListOrder;
  archived: boolean;
  search: string;
  contact: ContactFilter;
  cursor?: string;
}
export function validateClientList(input: ClientListInput): ClientListQuery {
  const search = (input.search ?? '').trim();
  const contact = input.contact ?? 'all';
  if (
    typeof input.archived !== 'boolean' ||
    Array.from(search).length > 100 ||
    Array.from(search).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    }) ||
    !['all', 'email', 'phone', 'none'].includes(contact)
  ) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid client search filters',
    );
  }
  return {
    archived: input.archived,
    order: validateListOrder(input.order),
    search,
    contact,
    ...(input.cursor === undefined ? {} : { cursor: validateId(input.cursor) }),
  };
}
