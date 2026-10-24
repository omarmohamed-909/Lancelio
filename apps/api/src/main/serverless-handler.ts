import type { RequestHandler } from 'express';
import { EnvironmentConfigurationError } from './config.js';

export function createServerlessHandler(
  load: () => Promise<{
    app: RequestHandler;
    afterResponse?: () => Promise<void>;
  }>,
  scheduleBackground?: (work: Promise<void>) => void,
): RequestHandler {
  let runtime: ReturnType<typeof load> | null = null;
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
    let ready: Awaited<ReturnType<typeof load>>;
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
    if (!response.destroyed) {
      if (ready.afterResponse && scheduleBackground) {
        const afterResponse = ready.afterResponse;
        const done = new Promise<void>((resolve) => {
          response.once('finish', resolve);
          response.once('close', resolve);
        });
        const work = done.then(afterResponse).catch(() => {
          console.error(
            'Welcome queue processing failed; a later request can retry.',
          );
        });
        try {
          scheduleBackground(work);
        } catch {
          console.error('Welcome background scheduling unavailable.');
        }
      }
      ready.app(request, response, next);
    }
  };
}
