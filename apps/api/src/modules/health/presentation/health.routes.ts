import { Router } from 'express';

export function createHealthRouter(checkReadiness?: () => Promise<boolean>) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/', (_request, response) => {
    response.json({
      success: true,
      data: { status: 'ok', service: 'lancelio-api' },
    });
  });
  router.get('/ready', async (_request, response) => {
    let ready = false;
    try {
      ready = (await checkReadiness?.()) ?? false;
    } catch {
      // Infrastructure errors must not leak connection strings or credentials.
    }
    response.status(ready ? 200 : 503).json({
      success: ready,
      data: {
        status: ready ? 'ready' : 'unavailable',
        service: 'lancelio-api',
      },
    });
  });
  return router;
}
