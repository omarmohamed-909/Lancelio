import { z } from 'zod';
import { request } from '../../../shared/api/http-client';

const workspaceSettingsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  version: z.number().int().nonnegative().safe(),
  role: z.enum(['owner', 'admin', 'member']),
  canEdit: z.boolean(),
});
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export const workspaceSettingsApi = {
  read: (token: string, signal?: AbortSignal) =>
    request('/settings/workspace', workspaceSettingsSchema, {
      method: 'GET',
      token,
      ...(signal ? { signal } : {}),
    }),
  update: (token: string, name: string, version: number) =>
    request('/settings/workspace', workspaceSettingsSchema, {
      method: 'PUT',
      token,
      body: { name, version },
    }),
};
