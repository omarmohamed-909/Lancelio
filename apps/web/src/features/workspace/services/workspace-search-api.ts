import { z } from 'zod';
import { request } from '../../../shared/api/http-client';
export const searchSchema = z.object({
  groups: z
    .array(
      z.object({
        kind: z.enum(['clients', 'projects', 'proposals', 'invoices']),
        items: z
          .array(
            z.object({
              id: z.string().regex(/^[a-f\d]{24}$/u),
              title: z.string(),
              subtitle: z.string(),
              archived: z.boolean(),
            }),
          )
          .max(5),
        hasMore: z.boolean(),
      }),
    )
    .max(4),
});
export type SearchResults = z.infer<typeof searchSchema>;
export function searchWorkspace(
  token: string,
  query: string,
  signal: AbortSignal,
) {
  return request('/search?' + new URLSearchParams({ q: query }), searchSchema, {
    token,
    method: 'GET',
    signal,
  });
}
