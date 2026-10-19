import { createApiRuntime } from './create-api-runtime.js';
import { EnvironmentConfigurationError, readEnvironment } from './config.js';

export async function createVercelRuntime(
  variables: NodeJS.ProcessEnv = process.env,
) {
  const production = { ...variables, NODE_ENV: 'production' };
  if (
    readEnvironment(production).EMAIL_PROVIDER === 'resend' &&
    variables.RECOVERY_WORKER_MODE !== 'external'
  ) {
    throw new EnvironmentConfigurationError(['RECOVERY_WORKER_MODE']);
  }
  return createApiRuntime(production);
}
