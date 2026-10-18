import { ApplicationError } from '../../../shared/domain/application-error.js';
export interface ClientDetails {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
}
export interface Client extends ClientDetails {
  id: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}
export interface ClientPage {
  items: Client[];
  nextCursor: string | null;
}
export function validateDetails(input: ClientDetails): ClientDetails {
  const value = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    company: input.company.trim(),
    notes: input.notes.trim(),
  };
  const fields: Record<string, string> = {};
  if (Array.from(value.name).length < 2 || Array.from(value.name).length > 100)
    fields.name = 'Name must contain 2–100 characters';
  if (
    value.email &&
    (value.email.length > 254 ||
      !/^[a-z0-9.!#$%&'*+\/=?^_\x60{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/iu.test(
        value.email,
      ))
  )
    fields.email = 'Invalid email';
  if (
    value.phone &&
    (!/^[+0-9() .-]{3,40}$/u.test(value.phone) || !/[0-9]/u.test(value.phone))
  )
    fields.phone = 'Invalid phone number';
  if (Array.from(value.company).length > 120)
    fields.company = 'Company must not exceed 120 characters';
  if (Array.from(value.notes).length > 2000)
    fields.notes = 'Notes must not exceed 2000 characters';
  if (Object.keys(fields).length)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid client details',
      fields,
    );
  return value;
}
export {
  validateId,
  validateVersion,
} from '../../../shared/domain/identifiers.js';
