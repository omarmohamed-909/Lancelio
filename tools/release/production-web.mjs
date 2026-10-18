import process from 'node:process';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { setTimeout } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '../..');
const next = join(root, 'node_modules/next/dist/bin/next');
const certificateDirectory = join(root, '.cache/release-tls');
await mkdir(certificateDirectory, { recursive: true, mode: 0o700 });
const certificate = join(certificateDirectory, 'localhost.pem');
const key = join(certificateDirectory, 'localhost-key.pem');
try {
  await stat(certificate);
  await stat(key);
} catch {
  const openssl =
    process.env.OPENSSL_BINARY ??
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
      : 'openssl');
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      certificate,
      '-days',
      '2',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
}

const environment = {
  ...process.env,
  NEXT_PUBLIC_API_URL: '/api/v1',
  API_UPSTREAM_ORIGIN: 'http://localhost:5100',
};
let child;
let proxy;
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  child?.kill();
  proxy?.close();
  proxy?.closeAllConnections();
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

child = spawn(process.execPath, [next, 'build'], {
  cwd: join(root, 'apps/web'),
  env: environment,
  stdio: 'inherit',
  windowsHide: true,
});
const built = await new Promise((accept, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => accept(code));
});
if (built !== 0) process.exit(1);
child = spawn(
  process.execPath,
  [next, 'start', '--port', '3100', '--hostname', 'localhost'],
  {
    cwd: join(root, 'apps/web'),
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  },
);
child.once('error', () => {
  console.error('Production web process failed.');
  process.exit(1);
});
child.once('exit', () => {
  if (!stopping) process.exit(1);
});
let ready = false;
for (let attempt = 0; attempt < 120; attempt++) {
  try {
    ready = (
      await globalThis.fetch('http://localhost:3100/login', {
        signal: globalThis.AbortSignal.timeout(1000),
      })
    ).ok;
  } catch {
    /* Starting. */
  }
  if (ready) break;
  await setTimeout(500);
}
if (!ready) {
  child.kill();
  throw new Error('Production web did not become ready.');
}
proxy = createServer(
  { key: await readFile(key), cert: await readFile(certificate) },
  (incoming, outgoing) => {
    const upstream = request(
      {
        hostname: 'localhost',
        port: 3100,
        method: incoming.method,
        path: incoming.url,
        headers: { ...incoming.headers, host: 'localhost:3100' },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on('error', () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
    outgoing.on('close', () => upstream.destroy());
  },
);
proxy.listen(3443, 'localhost', () =>
  console.info('Local production HTTPS smoke ready: https://localhost:3443'),
);
