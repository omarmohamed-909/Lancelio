import type { RequestHandler } from 'express';
import { EnvironmentConfigurationError } from './config.js';

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
          console.error(
            'Lancelio API initialization failed.',
            error instanceof EnvironmentConfigurationError
              ? { code: 'INVALID_CONFIGURATION', fields: error.fields }
              : { code: 'DATABASE_OR_RUNTIME_INITIALIZATION_FAILED' },
          );
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
