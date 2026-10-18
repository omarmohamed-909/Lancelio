import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    WEB_ORIGIN: z.url().default('http://localhost:3000'),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//u),
    JWT_ACCESS_SECRET: z.string().min(32),
    EMAIL_PROVIDER: z.enum(['disabled', 'resend']).default('disabled'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    ASSISTANT_PROVIDER: z
      .enum(['guided', 'openai', 'gemini'])
      .default('guided'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().optional(),
  })
  .superRefine((environment, context) => {
    if (environment.ASSISTANT_PROVIDER !== 'guided') {
      const fields =
        environment.ASSISTANT_PROVIDER === 'gemini'
          ? (['GEMINI_API_KEY', 'GEMINI_MODEL'] as const)
          : (['OPENAI_API_KEY', 'OPENAI_MODEL'] as const);
      for (const field of fields) {
        if (!environment[field]?.trim())
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'Required for intelligent assistant',
          });
      }
    }
    if (environment.EMAIL_PROVIDER === 'resend') {
      if (!environment.RESEND_API_KEY?.trim())
        context.addIssue({
          code: 'custom',
          path: ['RESEND_API_KEY'],
          message: 'Required',
        });
      if (
        !environment.EMAIL_FROM ||
        !z.email().safeParse(environment.EMAIL_FROM).success
      )
        context.addIssue({
          code: 'custom',
          path: ['EMAIL_FROM'],
          message: 'A sender mailbox is required',
        });
    }
    let origin: URL;
    try {
      origin = new URL(environment.WEB_ORIGIN);
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: 'A valid origin is required',
      });
      return;
    }
    if (
      origin.origin !== environment.WEB_ORIGIN ||
      (environment.NODE_ENV === 'production' && origin.protocol !== 'https:')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: 'A canonical origin is required; production requires HTTPS',
      });
    }
  });

export class EnvironmentConfigurationError extends Error {
  constructor(fields: readonly string[]) {
    super(`Invalid environment configuration: ${fields.join(', ')}`);
    this.name = 'EnvironmentConfigurationError';
  }
}

export function readEnvironment(environment: NodeJS.ProcessEnv) {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.'));
    throw new EnvironmentConfigurationError(fields);
  }
  return parsed.data;
}

export function assistantConfiguration(
  environment: ReturnType<typeof readEnvironment>,
) {
  if (environment.ASSISTANT_PROVIDER === 'guided') return null;
  return {
    provider: environment.ASSISTANT_PROVIDER,
    apiKey: (environment.ASSISTANT_PROVIDER === 'gemini'
      ? environment.GEMINI_API_KEY!
      : environment.OPENAI_API_KEY!
    ).trim(),
    model: (environment.ASSISTANT_PROVIDER === 'gemini'
      ? environment.GEMINI_MODEL!
      : environment.OPENAI_MODEL!
    ).trim(),
  };
}
