import { Router } from 'express';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { AskAssistant } from '../application/ask-assistant.js';

type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { user: { id: string }; workspace: { id: string } } }
>;
const body = z.strictObject({
  message: z.string().trim().min(1).max(1000),
  history: z.array(z.string().trim().min(1).max(1000)).max(6).default([]),
});
export function createAssistantRouter(
  service: AskAssistant,
  webOrigin: string,
) {
  const router = Router();
  router.use((request, _response, next) => {
    if (!z.strictObject({}).safeParse(request.query).success)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Invalid assistant request',
      );
    next();
  });
  const origin: Handler = (request, _response, next) => {
    if (request.get('origin') !== webOrigin)
      throw new ApplicationError(
        'UNTRUSTED_ORIGIN',
        'Request origin is not allowed',
      );
    next();
  };
  router.get('/', (_request, response) => {
    response.json({ success: true, data: { mode: service.mode } });
  });
  const limit = rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_request, response) => {
      const identity = response.locals.identity as {
        user: { id: string };
        workspace: { id: string };
      };
      return identity.workspace.id + ':' + identity.user.id;
    },
    handler: (_request, response) => {
      response
        .status(429)
        .json({ success: false, error: { code: 'RATE_LIMITED' } });
    },
  });
  const ask: Handler = async (request, response) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Invalid assistant question',
      );
    const controller = new AbortController();
    const close = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.once('close', close);
    try {
      const data = await service.execute(
        response.locals.identity.workspace.id,
        parsed.data,
        controller.signal,
      );
      if (!controller.signal.aborted) response.json({ success: true, data });
    } finally {
      response.off('close', close);
    }
  };
  router.post('/', origin, limit, ask);
  return router;
}
