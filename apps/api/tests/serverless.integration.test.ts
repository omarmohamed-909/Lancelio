import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import express from 'express';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createVercelRuntime } from '../src/main/create-vercel-runtime.js';
import { createServerlessHandler } from '../src/main/serverless-handler.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';

let replica: MongoMemoryReplSet;
let runtime: Awaited<ReturnType<typeof createVercelRuntime>> | undefined;
const origin = 'https://app.example.com';

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: {
      ...mongoBinaryOptions(),
      downloadDir: resolve(
        import.meta.dirname,
        '../../../.cache/mongodb-binaries',
      ),
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
}, 240_000);

afterAll(async () => {
  await runtime?.database.close();
  await replica?.stop();
});

it('serves real production authentication through the Vercel adapter without binding a persistent server', async () => {
  const load = vi.fn(async () => {
    runtime = await createVercelRuntime({
      MONGODB_URI: replica.getUri('serverless-runtime-tests'),
      WEB_ORIGIN: origin,
      JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
      EMAIL_PROVIDER: 'disabled',
    });
    return runtime;
  });
  const app = express()
    .disable('x-powered-by')
    .use(createServerlessHandler(load));
  const ready = await request(app).get('/api/v1/health/ready');
  expect(ready.status).toBe(200);
  expect(ready.headers['cache-control']).toBe('no-store');
  expect(ready.headers['x-powered-by']).toBeUndefined();
  expect(ready.headers['x-content-type-options']).toBe('nosniff');
  const account = {
    name: 'Vercel User',
    email: 'vercel@example.com',
    password: 'isolated secure runtime password',
    workspaceName: 'Vercel Studio',
  };
  const registration = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .send(account);
  expect(registration.status).toBe(201);
  expect(String(registration.headers['set-cookie'])).toMatch(
    /^__Host-lancelio_refresh=/u,
  );
  expect(
    (
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${registration.body.data.accessToken}`)
    ).status,
  ).toBe(200);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ email: account.email, password: account.password });
  expect(login.status).toBe(200);
  const cookie = String(login.headers['set-cookie']);
  expect(cookie).toMatch(/^__Host-lancelio_refresh=/u);
  expect(cookie).toContain('; Secure');
  expect(cookie).toContain('; HttpOnly');
  expect(cookie).toContain('; SameSite=Strict');
  expect(cookie).not.toMatch(/; Domain=/iu);
  const token = login.body.data.accessToken;
  expect(
    (
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'https://foreign.example.com')
        .set('Cookie', cookie.split(';')[0]!)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', origin)
        .set('Cookie', cookie.split(';')[0]!)
    ).status,
  ).toBe(204);
  expect(
    (
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
    ).status,
  ).toBe(401);
  expect(load).toHaveBeenCalledTimes(1);
  await replica.stop();
  expect((await request(app).get('/api/v1/health/ready')).status).toBe(503);
  expect((await request(app).get('/api/v1/health')).status).toBe(200);
}, 60_000);
