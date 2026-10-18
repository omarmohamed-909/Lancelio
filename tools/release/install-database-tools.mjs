import process from 'node:process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Buffer } from 'node:buffer';

// Pinned official archives. Updating the version requires reviewing new hashes.
const archives = {
  win32: {
    platform: 'windows',
    extension: 'zip',
    sha256: '527738a0f9ab2d80ea40cb8fc7a68f8e28664a2fd4e3b63626c2d4629aeb7f37',
  },
  linux: {
    platform: 'ubuntu2404',
    extension: 'tgz',
    sha256: 'f34b84a67ab96b4ff52571ec5d15e2148d96cb140b1ea9ef8c29ac33c48e3480',
  },
};
const archive = archives[process.platform];
if (!archive || process.arch !== 'x64')
  throw new Error(
    'Automatic install supports Windows x64 and Ubuntu 24.04 x64. Set MONGODB_TOOLS_DIRECTORY for other systems.',
  );
const name = `mongodb-database-tools-${archive.platform}-x86_64-100.19.1`;
const directory = resolve(import.meta.dirname, '../../.cache/database-tools');
await mkdir(directory, { recursive: true });
const response = await globalThis.fetch(
  `https://fastdl.mongodb.org/tools/db/${name}.${archive.extension}`,
  { signal: globalThis.AbortSignal.timeout(120_000) },
);
if (!response.ok) throw new Error('Official tools download failed.');
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== archive.sha256)
  throw new Error('Official tools checksum mismatch; nothing extracted.');
const file = join(directory, `${name}.${archive.extension}`);
await writeFile(file, bytes);
execFileSync('tar', ['-xf', file, '-C', directory], {
  stdio: 'ignore',
  windowsHide: true,
});
console.info(join(directory, name, 'bin'));
