import { Router } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ManageWorkspaceSettings } from '../application/manage-workspace-settings.js';
import type { AuthenticatedHandler } from './authentication.middleware.js';

const changeSchema = z.strictObject({ name: z.string(), version: z.number() });

export function createWorkspaceSettingsRouter(
  service: ManageWorkspaceSettings,
  webOrigin: string,
) {
  const router = Router();
  const read: AuthenticatedHandler = async (_request, response) => {
    const { user, workspace } = response.locals.identity;
    response.json({
      success: true,
      data: await service.read({ userId: user.id, workspaceId: workspace.id }),
    });
  };
  const update: AuthenticatedHandler = async (request, response) => {
    if (request.get('origin') !== webOrigin)
      throw new ApplicationError(
        'UNTRUSTED_ORIGIN',
        'Request origin is not allowed',
      );
    const parsed = changeSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Invalid workspace settings',
      );
    const { user, workspace } = response.locals.identity;
    response.json({
      success: true,
      data: await service.update(
        { userId: user.id, workspaceId: workspace.id },
        parsed.data,
      ),
    });
  };
  router.get('/', read);
  router.put('/', update);
  return router;
}
