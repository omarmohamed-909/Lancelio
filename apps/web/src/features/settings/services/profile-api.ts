import { z } from 'zod';
import { request } from '../../../shared/api/http-client';

const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  version: z.number().int().nonnegative().safe(),
});
export type Profile = z.infer<typeof profileSchema>;
export const profileApi = {
  read: (token: string, signal?: AbortSignal) =>
    request('/settings/profile', profileSchema, {
      method: 'GET',
      token,
      ...(signal ? { signal } : {}),
    }),
  update: (token: string, name: string, version: number) =>
    request('/settings/profile', profileSchema, {
      method: 'PUT',
      token,
      body: { name, version },
    }),
};
