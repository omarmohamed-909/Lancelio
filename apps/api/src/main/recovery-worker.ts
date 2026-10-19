import { createApiRuntime } from './create-api-runtime.js';
import { EnvironmentConfigurationError, readEnvironment } from './config.js';
import { startRecoveryWorker } from './recovery-worker-loop.js';

async function bootstrap() {
  if (readEnvironment(process.env).EMAIL_PROVIDER !== 'resend')
    throw new EnvironmentConfigurationError(['EMAIL_PROVIDER']);
  const { database, recovery } = await createApiRuntime();
  const worker = startRecoveryWorker(recovery, { keepAlive: true });
  console.info('Recovery worker is running.');
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 15_000);
    timeout.unref();
    void worker
      .stop()
      .then(() => database.close())
      .then(() => {
        clearTimeout(timeout);
        process.exit(0);
      })
      .catch(() => process.exit(1));
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

void bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof EnvironmentConfigurationError
      ? error.message
      : 'Recovery worker startup failed. Check database connectivity and worker configuration.',
  );
  process.exitCode = 1;
});
