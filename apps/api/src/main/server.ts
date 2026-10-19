import { createApiRuntime } from './create-api-runtime.js';
import { EnvironmentConfigurationError } from './config.js';
import { startRecoveryWorker } from './recovery-worker-loop.js';

async function bootstrap() {
  const { app, database, recovery, environment } = await createApiRuntime();
  let server: ReturnType<typeof app.listen>;
  try {
    server = app.listen(environment.PORT, () => {
      console.info(`Lancelio API listening on port ${environment.PORT}`);
    });
  } catch (error: unknown) {
    await database.close();
    throw error;
  }
  const worker = startRecoveryWorker(recovery);
  server.once('error', () => {
    console.error('API could not listen. Check the configured port.');
    void worker
      .stop()
      .then(() => database.close())
      .finally(() => process.exit(1));
  });
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    const stopped = worker.stop();
    server.close((error) => {
      void stopped
        .then(() => database.close())
        .then(() => {
          clearTimeout(timeout);
          process.exit(error ? 1 : 0);
        })
        .catch(() => process.exit(1));
    });
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

void bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof EnvironmentConfigurationError
      ? error.message
      : 'API startup failed. Check MongoDB connectivity, transaction support, and collection/index permissions.',
  );
  process.exitCode = 1;
});
