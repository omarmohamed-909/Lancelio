import { z } from 'zod';
import { request } from '../../../shared/api/http-client';
import { clientSchema } from '../schemas/client';
import type { Client, ClientDetails, ClientFilters } from '../schemas/client';
export { clientFormSchema } from '../schemas/client';
export type { Client, ClientDetails } from '../schemas/client';
export const clientApi = {
  list: (
    token: string,
    filters: ClientFilters,
    cursor?: string,
    signal?: AbortSignal,
  ) =>
    request(
      '/clients?' +
        new URLSearchParams({
          status: filters.archived ? 'archived' : 'active',
          ...(filters.search.trim() ? { q: filters.search.trim() } : {}),
          contact: filters.contact,
          ...(filters.order === 'oldest' ? { order: filters.order } : {}),
          ...(cursor ? { cursor } : {}),
        }),
      z.object({
        items: z.array(clientSchema),
        nextCursor: z.string().nullable(),
      }),
      { method: 'GET', token, ...(signal ? { signal } : {}) },
    ),
  read: (token: string, id: string, signal?: AbortSignal) =>
    request('/clients/' + id, clientSchema, {
      method: 'GET',
      token,
      ...(signal ? { signal } : {}),
    }),
  create: (token: string, body: ClientDetails) =>
    request('/clients', clientSchema, { token, body }),
  update: (token: string, client: Client, body: ClientDetails) =>
    request('/clients/' + client.id, clientSchema, {
      method: 'PUT',
      token,
      body: { ...body, version: client.version },
    }),
  archive: (token: string, client: Client) =>
    request('/clients/' + client.id + '/archive', clientSchema, {
      token,
      body: { version: client.version },
    }),
};
export function clientError(error: unknown): string {
  if (error instanceof Error && error.message === 'CLIENT_CONFLICT')
    return 'البيانات اتغيرت من مكان تاني. حمّل آخر نسخة قبل ما تكمل.';
  if (error instanceof Error && error.message === 'CLIENT_ARCHIVED')
    return 'العميل ده اتأرشف بالفعل. حدّث القائمة.';
  if (error instanceof Error && error.message === 'CLIENT_NOT_FOUND')
    return 'العميل مش موجود في مساحتك. حدّث القائمة.';
  return '';
}
