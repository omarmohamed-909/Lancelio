import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { mongoBinaryOptions } from '../../apps/api/tests/helpers/mongo-binary.js';

async function freePort() {
  const socket = createServer();
  await new Promise<void>((accept, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', accept);
  });
  const address = socket.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((accept, reject) =>
    socket.close((error) => (error ? reject(error) : accept())),
  );
  return address.port;
}

for (const entry of ['persistent', 'vercel'] as const)
  test(
    `${entry} production API boots, serves secure sessions and becomes unready after Mongo loss`,
    { timeout: 120_000 },
    async () => {
      const root = resolve(import.meta.dirname, '../..');
      const replica = await MongoMemoryReplSet.create({
        binary: {
          ...mongoBinaryOptions(),
          downloadDir: resolve(root, '.cache/mongodb-binaries'),
        },
        replSet: { count: 1, storageEngine: 'wiredTiger' },
      });
      const port = await freePort();
      const base = `http://127.0.0.1:${port}/api/v1`;
      const origin = 'https://localhost:3443';
      const child = spawn(
        process.execPath,
        entry === 'persistent'
          ? [resolve(root, 'apps/api/dist/main/server.js')]
          : [
              '--input-type=module',
              '-e',
              "import app from './apps/api/app.mjs'; app.listen(Number(process.env.PORT), '127.0.0.1');",
            ],
        {
          cwd: root,
          windowsHide: true,
          stdio: 'ignore',
          // No application .env is read and no production credentials are inherited.
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            HOME: process.env.HOME,
            NODE_ENV: 'production',
            PORT: String(port),
            WEB_ORIGIN: origin,
            MONGODB_URI: replica.getUri('release_api_startup'),
            JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
            EMAIL_PROVIDER: 'disabled',
          },
        },
      );
      const exited = new Promise<void>((accept) =>
        child.once('exit', () => accept()),
      );
      let spawnFailed = false;
      child.once('error', () => {
        spawnFailed = true;
      });
      const get = (path: string) =>
        fetch(base + path, { signal: AbortSignal.timeout(5000) });
      const post = (
        path: string,
        body?: object,
        cookie?: string,
        requestOrigin = origin,
      ) =>
        fetch(base + path, {
          method: 'POST',
          headers: {
            Origin: requestOrigin,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(8000),
        });
      try {
        let ready = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          assert.equal(
            spawnFailed,
            false,
            'Production process failed to start',
          );
          assert.equal(
            child.exitCode,
            null,
            'Production process exited before readiness',
          );
          try {
            ready = (await get('/health/ready')).ok;
          } catch {
            /* Starting. */
          }
          if (ready) break;
          await setTimeout(250);
        }
        assert.ok(ready, 'Compiled production API did not become ready');
        const account = {
          name: 'Release startup owner',
          email: 'startup@example.com',
          password: 'release startup isolated test passphrase',
          workspaceName: 'Release startup workspace',
        };
        assert.equal((await post('/auth/register', account)).status, 201);
        const login = await post('/auth/login', {
          email: account.email,
          password: account.password,
        });
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie');
        assert.ok(cookie);
        assert.match(cookie, /^__Host-lancelio_refresh=/u);
        assert.match(cookie, /; Secure(?:;|$)/u);
        assert.match(cookie, /; HttpOnly(?:;|$)/u);
        assert.match(cookie, /; SameSite=Strict(?:;|$)/u);
        assert.doesNotMatch(cookie, /; Domain=/iu);
        const identity = (await login.json()) as {
          data: { accessToken: string };
        };
        const privateRead = () =>
          fetch(base + '/auth/me', {
            headers: { Authorization: 'Bearer ' + identity.data.accessToken },
            signal: AbortSignal.timeout(5000),
          });
        assert.equal((await privateRead()).status, 200);
        const header = cookie.split(';')[0]!;
        assert.equal(
          (
            await post(
              '/auth/refresh',
              undefined,
              header,
              'https://foreign.example',
            )
          ).status,
          403,
        );
        assert.equal(
          (await post('/auth/logout', undefined, header)).status,
          204,
        );
        assert.equal((await privateRead()).status, 401);
        // Exercise the newly wired private route on the real compiled production entry point.
        const securityLogin = await post('/auth/login', {
          email: account.email,
          password: account.password,
        });
        assert.equal(securityLogin.status, 200);
        const securityCookie = securityLogin.headers
          .get('set-cookie')!
          .split(';')[0]!;
        const securityIdentity = (await securityLogin.json()) as {
          data: { accessToken: string };
        };
        const nextPassword = 'new production startup test passphrase';
        const workspaceRead = await fetch(base + '/settings/workspace', {
          headers: {
            Authorization: 'Bearer ' + securityIdentity.data.accessToken,
          },
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(workspaceRead.status, 200);
        assert.equal(workspaceRead.headers.get('cache-control'), 'no-store');
        const workspaceSettings = (await workspaceRead.json()) as {
          data: {
            id: string;
            name: string;
            slug: string;
            version: number;
            role: string;
            canEdit: boolean;
          };
        };
        assert.equal(workspaceSettings.data.canEdit, true);
        const renamed = await fetch(base + '/settings/workspace', {
          method: 'PUT',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + securityIdentity.data.accessToken,
          },
          body: JSON.stringify({
            name: 'Renamed production workspace',
            version: workspaceSettings.data.version,
          }),
          signal: AbortSignal.timeout(8000),
        });
        assert.equal(renamed.status, 200);
        assert.equal(renamed.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await renamed.json(), {
          success: true,
          data: {
            ...workspaceSettings.data,
            name: 'Renamed production workspace',
            version: 1,
          },
        });
        const changed = await fetch(base + '/settings/password', {
          method: 'POST',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + securityIdentity.data.accessToken,
          },
          body: JSON.stringify({
            currentPassword: account.password,
            newPassword: nextPassword,
          }),
          signal: AbortSignal.timeout(8000),
        });
        assert.equal(changed.status, 204);
        assert.equal(changed.headers.get('cache-control'), 'no-store');
        const cleared = changed.headers.get('set-cookie')!;
        assert.match(cleared, /^__Host-lancelio_refresh=;/u);
        assert.match(cleared, /; Secure(?:;|$)/u);
        assert.match(cleared, /; HttpOnly(?:;|$)/u);
        assert.match(cleared, /; SameSite=Strict(?:;|$)/u);
        assert.doesNotMatch(cleared, /; Domain=/iu);
        assert.equal(
          (await post('/auth/refresh', undefined, securityCookie)).status,
          401,
        );
        assert.equal(
          (
            await post('/auth/login', {
              email: account.email,
              password: account.password,
            })
          ).status,
          401,
        );
        const newLogin = await post('/auth/login', {
          email: account.email,
          password: nextPassword,
        });
        assert.equal(newLogin.status, 200);
        assert.equal(
          (
            await post(
              '/auth/logout',
              undefined,
              newLogin.headers.get('set-cookie')!.split(';')[0]!,
            )
          ).status,
          204,
        );
        await replica.stop();
        const readiness = await get('/health/ready');
        assert.equal(readiness.status, 503);
        assert.equal(readiness.headers.get('cache-control'), 'no-store');
        assert.equal((await get('/health')).status, 200);
      } finally {
        if (child.exitCode === null) child.kill();
        await Promise.race([
          exited,
          setTimeout(10_000, undefined, { ref: false }),
        ]);
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL');
        await replica.stop();
      }
    },
  );
