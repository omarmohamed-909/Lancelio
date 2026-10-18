import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/main/create-app.js';
import { readEnvironment } from '../src/main/config.js';
import { errorHandler } from '../src/shared/presentation/http/error-handler.js';

describe('HTTP foundation', () => {
  const app = createApp('http://localhost:3000');

  it('provides a liveness endpoint without exposing framework details', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: 'ok', service: 'lancelio-api' },
    });
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns a consistent JSON error for unknown routes', async () => {
    const response = await request(app).get('/api/v1/missing');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('reports readiness only after a successful dependency check and never caches it', async () => {
    for (const ready of [true, false]) {
      const response = await request(
        createApp('http://localhost:3000', {
          checkReadiness: async () => ready,
        }),
      ).get('/api/v1/health/ready');
      expect(response.status).toBe(ready ? 200 : 503);
      expect(response.body.success).toBe(ready);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect((await request(app).get('/api/v1/health/ready')).status).toBe(503);
  });

  it('keeps readiness failures private while preserving liveness', async () => {
    const failing = createApp('http://localhost:3000', {
      checkReadiness: async () => {
        throw new Error('private-mongodb-credential');
      },
    });
    const response = await request(failing).get('/api/v1/health/ready');
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private-mongodb');
    expect((await request(failing).get('/api/v1/health')).status).toBe(200);
  });

  it('rejects malformed JSON with a client error', async () => {
    const response = await request(app)
      .post('/api/v1/missing')
      .set('Content-Type', 'application/json')
      .send('{broken');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('limits request payload size', async () => {
    const response = await request(app)
      .post('/api/v1/missing')
      .send({ value: 'x'.repeat(110_000) });
    expect(response.status).toBe(413);
  });

  it('does not expose exception messages or stacks', async () => {
    const failingApp = express();
    failingApp.get('/failure', async () => {
      throw new Error('private-database-details');
    });
    failingApp.use(errorHandler);
    const response = await request(failingApp).get('/failure');
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain(
      'private-database-details',
    );
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('fails invalid environment configuration without echoing values', () => {
    expect(() =>
      readEnvironment({
        PORT: 'secret-invalid-value',
        MONGODB_URI: 'mongodb://localhost:27017/test',
        JWT_ACCESS_SECRET: 'unit-test-signing-secret-at-least-32-characters',
      }),
    ).toThrow('Invalid environment configuration: PORT');
  });

  it('requires a MongoDB URI and reports field names without exposing credentials', () => {
    expect(() =>
      readEnvironment({
        JWT_ACCESS_SECRET: 'unit-test-signing-secret-at-least-32-characters',
      }),
    ).toThrow('Invalid environment configuration: MONGODB_URI');
    expect(() =>
      readEnvironment({
        MONGODB_URI: 'private-invalid-uri',
        JWT_ACCESS_SECRET: 'unit-test-signing-secret-at-least-32-characters',
      }),
    ).toThrow('Invalid environment configuration: MONGODB_URI');
  });

  it('requires a signing key and a valid origin without printing invalid values', () => {
    const environment = {
      MONGODB_URI: 'mongodb://localhost:27017/test',
      JWT_ACCESS_SECRET: 'unit-test-signing-secret-at-least-32-characters',
    };
    expect(() =>
      readEnvironment({ ...environment, JWT_ACCESS_SECRET: 'weak-secret' }),
    ).toThrow('Invalid environment configuration: JWT_ACCESS_SECRET');
    expect(() =>
      readEnvironment({ ...environment, WEB_ORIGIN: 'invalid-origin' }),
    ).toThrow('Invalid environment configuration: WEB_ORIGIN');
    expect(() =>
      readEnvironment({
        ...environment,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'http://example.com',
      }),
    ).toThrow('Invalid environment configuration: WEB_ORIGIN');
    expect(() =>
      readEnvironment({
        ...environment,
        WEB_ORIGIN: 'http://localhost:3000/path',
      }),
    ).toThrow('Invalid environment configuration: WEB_ORIGIN');
  });
});
