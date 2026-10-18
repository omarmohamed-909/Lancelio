import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { ReadWorkspaceOverview } from '../application/read-workspace-overview.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
export function createDashboardRouter(overview: ReadWorkspaceOverview) {
  const router = Router();
  const read: RequestHandler<
    Record<string, string>,
    unknown,
    unknown,
    Record<string, string>,
    { identity: { workspace: { id: string } } }
  > = async (request, response) => {
    if (!z.strictObject({}).safeParse(request.query).success)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Invalid overview request',
      );
    response.json({
      success: true,
      data: await overview.execute(response.locals.identity.workspace.id),
    });
  };
  router.get('/', read);
  return router;
}
