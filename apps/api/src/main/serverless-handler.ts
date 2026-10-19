import type { RequestHandler } from 'express';

export function createServerlessHandler(
  load: () => Promise<{ app: RequestHandler }>,
): RequestHandler {
  let runtime: Promise<{ app: RequestHandler }> | null = null;
  return async (request, response, next) => {
    if (!runtime)
      runtime = Promise.resolve()
        .then(load)
        .catch((error: unknown) => {
          runtime = null;
          throw error;
        });
    let ready: { app: RequestHandler };
    try {
      ready = await runtime;
    } catch {
      if (response.destroyed) return;
      response.setHeader('Cache-Control', 'no-store');
      response
        .status(503)
        .json({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      return;
    }
    if (!response.destroyed) ready.app(request, response, next);
  };
}
