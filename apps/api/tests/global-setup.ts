import { resolve } from 'node:path';
import { MongoBinary } from 'mongodb-memory-server-core';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';

export default async function prepareMongoBinary() {
  // Resolve/download once before parallel workers can touch the shared archive.
  await MongoBinary.getPath({
    ...mongoBinaryOptions(),
    downloadDir: resolve(
      import.meta.dirname,
      '../../../.cache/mongodb-binaries',
    ),
  });
}
