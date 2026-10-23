import process from 'node:process';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const next = join(root, 'node_modules/next/dist/bin/next');
const environment = {
  ...process.env,
  PWA_ISOLATED_BUILD: '1',
  NEXT_PUBLIC_API_URL: 'http://localhost:5100/api/v1',
};
let child;
let stopping = false;
const stop = () => {
  stopping = true;
  child?.kill();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
function launch(args) {
  return spawn(process.execPath, [next, ...args], {
    cwd: join(root, 'apps/web'),
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
}
child = launch(['build']);
const code = await new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('exit', resolveExit);
});
if (code !== 0 || stopping) process.exit(1);
child = launch(['start', '--port', '3200', '--hostname', 'localhost']);
child.once('error', () => process.exit(1));
child.once('exit', () => process.exit(stopping ? 0 : 1));
