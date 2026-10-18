import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { SearchWorkspace } from '../application/search-workspace.js';
export function createSearchRouter(search: SearchWorkspace) {
  const router = Router();
  const read: RequestHandler<
    Record<string, string>,
    unknown,
    unknown,
    Record<string, string>,
    { identity: { workspace: { id: string } } }
  > = async (request, response) => {
    const parsed = z
      .strictObject({ q: z.string().trim().min(2).max(100) })
      .safeParse(request.query);
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid search query');
    response.json({
      success: true,
      data: {
        groups: await search.execute(
          response.locals.identity.workspace.id,
          parsed.data.q,
        ),
      },
    });
  };
  router.get('/', read);
  return router;
}
