import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerlessHandler } from '../src/main/serverless-handler.js';
import { createVercelRuntime } from '../src/main/create-vercel-runtime.js';
import { startRecoveryWorker } from '../src/main/recovery-worker-loop.js';
import { EnvironmentConfigurationError } from '../src/main/config.js';

describe('Vercel request lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());
  it('shares one cold initialization across concurrent requests and reuses it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = express().get('/ready', (_request, response) =>
      response.json({ ready: true }),
    );
    const load = vi.fn(async () => {
      await gate;
      return { app: inner };
    });
    const app = express().use(createServerlessHandler(load));
    const first = request(app)
      .get('/ready')
      .then((response) => response);
    const second = request(app)
      .get('/ready')
      .then((response) => response);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    release();
    for (const response of await Promise.all([first, second])) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ready: true });
    }
    expect((await request(app).get('/ready')).status).toBe(200);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each(['throw', 'reject'])(
    'retries after a private initialization failure (%s)',
    async (failure) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const inner = express().get('/ready', (_request, response) =>
        response.sendStatus(204),
      );
      let attempts = 0;
      const load = () => {
        if (++attempts === 1) {
          const error = new Error('private-database-credential');
          if (failure === 'throw') throw error;
          return Promise.reject(error);
        }
        return Promise.resolve({ app: inner });
      };
      const app = express()
        .disable('x-powered-by')
        .use(createServerlessHandler(load));
      const failed = await request(app).get('/ready');
      expect(failed.status).toBe(503);
      expect(failed.headers['cache-control']).toBe('no-store');
      expect(failed.body).toEqual({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
      expect(failed.text).not.toContain('private-database');
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-database');
      expect((await request(app).get('/ready')).status).toBe(204);
      expect(attempts).toBe(2);
    },
  );

  it('logs only recognized configuration field names and keeps the public response generic', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new EnvironmentConfigurationError([
      'MONGODB_URI',
      'WEB_ORIGIN',
      'private-credential-value',
      'MONGODB_URI',
    ]);
    error.message = 'private-provider-response';
    const app = express().use(
      createServerlessHandler(async () => {
        throw error;
      }),
    );
    const failed = await request(app).get('/api/v1/health/ready');
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    expect(log).toHaveBeenCalledWith('Lancelio API initialization failed.', {
      code: 'INVALID_CONFIGURATION',
      fields: ['MONGODB_URI', 'WEB_ORIGIN'],
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-');
    expect(failed.text).not.toContain('MONGODB_URI');
  });

  it('returns the response before welcome delivery completes and schedules bounded background work', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const afterResponse = vi.fn(async () => {
      await gate;
    });
    const background: Promise<void>[] = [];
    const inner = express().get('/signup', (_request, response) =>
      response.status(201).json({ created: true }),
    );
    const app = express().use(
      createServerlessHandler(
        async () => ({ app: inner, afterResponse }),
        (work) => {
          background.push(work);
        },
      ),
    );
    expect((await request(app).get('/signup')).status).toBe(201);
    expect(afterResponse).toHaveBeenCalledTimes(1);
    expect(background).toHaveLength(1);
    finish();
    await Promise.all(background);
  });
  it('keeps background delivery failures outside the successful HTTP response and redacts logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const background: Promise<void>[] = [];
    const inner = express().get('/signup', (_request, response) =>
      response.sendStatus(201),
    );
    const app = express().use(
      createServerlessHandler(
        async () => ({
          app: inner,
          afterResponse: async () => {
            throw new Error('private-mailer-detail');
          },
        }),
        (work) => {
          background.push(work);
        },
      ),
    );
    expect((await request(app).get('/signup')).status).toBe(201);
    await Promise.all(background);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-');
    expect(log).toHaveBeenCalledTimes(1);
  });
  const configuration = {
    NODE_ENV: 'development',
    WEB_ORIGIN: 'https://app.example.com',
    MONGODB_URI: 'mongodb://127.0.0.1:1/never-connect',
    JWT_ACCESS_SECRET: 'isolated-serverless-configuration-secret',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'unit-test-only',
    EMAIL_FROM: 'sender@example.com',
  };

  it('requires a separately configured recovery worker before enabling email', async () => {
    await expect(createVercelRuntime(configuration)).rejects.toThrow(
      'Invalid environment configuration: RECOVERY_WORKER_MODE',
    );
  });

  it('enforces HTTPS production configuration even when NODE_ENV was omitted or development', async () => {
    await expect(
      createVercelRuntime({
        ...configuration,
        EMAIL_PROVIDER: 'disabled',
        WEB_ORIGIN: 'http://localhost:3000',
      }),
    ).rejects.toThrow('Invalid environment configuration: WEB_ORIGIN');
  });
});

describe('independent recovery delivery loop', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not overlap deliveries and drains the current job before stopping', async () => {
    vi.useFakeTimers();
    let finish!: (value: boolean) => void;
    const deliverNext = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const worker = startRecoveryWorker({ deliverNext }, { intervalMs: 20 });
    await vi.advanceTimersByTimeAsync(100);
    expect(deliverNext).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(stopped).toBe(false);
    finish(true);
    await stopping;
    await vi.advanceTimersByTimeAsync(100);
    expect(deliverNext).toHaveBeenCalledTimes(1);
    expect(stopped).toBe(true);
  });

  it('retries failed delivery without logging provider secrets', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deliverNext = vi
      .fn()
      .mockRejectedValueOnce(new Error('private-provider-key'))
      .mockResolvedValue(false);
    const worker = startRecoveryWorker(
      { deliverNext },
      { intervalMs: 20, keepAlive: true },
    );
    await vi.advanceTimersByTimeAsync(45);
    await worker.stop();
    expect(deliverNext).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-provider');
  });
});
