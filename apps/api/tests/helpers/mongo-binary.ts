import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function mongoBinaryOptions() {
  const executable = process.platform === 'win32' ? 'mongod.exe' : 'mongod';
  const systemBinary =
    process.env.MONGOMS_SYSTEM_BINARY ??
    (process.env.PATH ?? '')
      .split(delimiter)
      .map((directory) => join(directory, executable))
      .find((candidate) => existsSync(candidate));

  if (!systemBinary)
    return { version: process.env.MONGOMS_VERSION ?? '8.0.16' };

  const output = execFileSync(systemBinary, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  const version =
    process.env.MONGOMS_VERSION ??
    /db version v(\d+\.\d+\.\d+)/u.exec(output)?.[1];
  if (!version)
    throw new Error('Could not determine the test MongoDB binary version');
  return { systemBinary, version };
}
