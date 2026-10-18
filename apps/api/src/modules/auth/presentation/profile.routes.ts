import { Router } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ManageProfile } from '../application/manage-profile.js';
import type { AuthenticatedHandler } from './authentication.middleware.js';

const changeSchema = z.strictObject({ name: z.string(), version: z.number() });

export function createProfileRouter(service: ManageProfile, webOrigin: string) {
  const router = Router();
  const read: AuthenticatedHandler = async (_request, response) => {
    response.json({
      success: true,
      data: await service.read(response.locals.identity.user.id),
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
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid profile change');
    response.json({
      success: true,
      data: await service.update(response.locals.identity.user.id, parsed.data),
    });
  };
  router.get('/', read);
  router.put('/', update);
  return router;
}
