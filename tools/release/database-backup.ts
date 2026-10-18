import { execFile } from 'node:child_process';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';
import process from 'node:process';
import { createConnection, Types } from 'mongoose';

type Options = {
  uri: string;
  key: string;
  toolsDirectory: string;
  file: string;
};
const magic = 'LANCELIO-BACKUP-1\n';
const namePattern = /^[a-zA-Z0-9_-]{1,63}$/u;

function databaseName(uri: string) {
  const name =
    /^mongodb(?:\+srv)?:\/\/[^/\r\n]+\/([a-zA-Z0-9_-]+)(?:\?[^#\r\n]*)?$/u.exec(
      uri,
    )?.[1];
  if (
    !name ||
    !namePattern.test(name) ||
    ['admin', 'config', 'local'].includes(name)
  )
    throw new Error(
      'Use an explicit non-system MongoDB database with a simple name.',
    );
  return name;
}

function encryptionKey(value: string) {
  if (!/^[a-f0-9]{64}$/iu.test(value))
    throw new Error(
      'BACKUP_ENCRYPTION_KEY must be a separate 32-byte hex key.',
    );
  return Buffer.from(value, 'hex');
}

async function temporaryFiles<T>(action: (directory: string) => Promise<T>) {
  const root = resolve(tmpdir());
  const directory = await mkdtemp(join(root, 'lancelio-backup-'));
  try {
    return await action(directory);
  } finally {
    // Only remove the exact temporary child created here, never a supplied path.
    const inside = relative(root, resolve(directory));
    if (
      !inside ||
      inside.startsWith('..') ||
      isAbsolute(inside) ||
      dirname(directory) !== root
    )
      throw new Error('Unsafe temporary cleanup path.');
    await rm(directory, { recursive: true, force: true });
  }
}

async function runTool(directory: string, name: string, args: string[]) {
  if (!isAbsolute(directory))
    throw new Error('MONGODB_TOOLS_DIRECTORY must be absolute.');
  const executable = join(
    directory,
    name + (process.platform === 'win32' ? '.exe' : ''),
  );
  await stat(executable);
  await new Promise<void>((accept, reject) => {
    execFile(
      executable,
      args,
      {
        windowsHide: true,
        timeout: 30 * 60 * 1000,
        maxBuffer: 1024 * 1024,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          HOME: process.env.HOME,
        },
      },
      (error) => {
        // Never return tool stdout/stderr: provider errors can contain the URI.
        if (error)
          reject(
            new Error(
              `${name} failed. Check permissions, connectivity and tool/server compatibility; the target may be incomplete.`,
            ),
          );
        else accept();
      },
    );
  });
}

async function configuration(directory: string, uri: string) {
  const file = join(directory, 'connection.yml');
  await writeFile(file, `uri: ${JSON.stringify(uri)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  return file;
}

/** Call only after stopping every API instance and worker that can write. */
export async function createBackup(
  options: Options & { writesPaused: boolean },
) {
  if (!options.writesPaused)
    throw new Error(
      'Stop all writers and explicitly acknowledge maintenance before dumping.',
    );
  const source = databaseName(options.uri);
  const key = encryptionKey(options.key);
  return temporaryFiles(async (directory) => {
    const config = await configuration(directory, options.uri);
    const archive = join(directory, 'database.archive.gz');
    await runTool(options.toolsDirectory, 'mongodump', [
      '--config',
      config,
      '--db',
      source,
      '--archive=' + archive,
      '--gzip',
      '--quiet',
    ]);
    const iv = randomBytes(12);
    const header = Buffer.from(
      magic +
        JSON.stringify({
          database: source,
          createdAt: new Date().toISOString(),
          iv: iv.toString('hex'),
        }) +
        '\n',
    );
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(header);
    const output = await open(options.file, 'wx', 0o600);
    try {
      await output.write(header);
      await pipeline(
        createReadStream(archive),
        cipher,
        createWriteStream(options.file, {
          fd: output.fd,
          autoClose: false,
          start: header.length,
        }),
      );
      await output.write(
        cipher.getAuthTag(),
        0,
        16,
        header.length + (await stat(archive)).size,
      );
      await output.sync();
    } catch {
      await output.close();
      await rm(options.file, { force: true });
      throw new Error(
        'Backup encryption failed; no usable backup was created.',
      );
    }
    await output.close();
    return { database: source, file: resolve(options.file) };
  });
}

async function decryptBackup(file: string, key: Buffer, archive: string) {
  const input = await open(file, 'r');
  let header: Buffer;
  let tag: Buffer;
  let size: number;
  try {
    size = (await input.stat()).size;
    const prefix = Buffer.alloc(Math.min(4096, size));
    await input.read(prefix, 0, prefix.length, 0);
    if (!prefix.subarray(0, magic.length).equals(Buffer.from(magic)))
      throw new Error('Unsupported backup format.');
    const end = prefix.indexOf('\n', magic.length);
    if (end === -1 || size <= end + 1 + 16)
      throw new Error('Invalid backup envelope.');
    header = prefix.subarray(0, end + 1);
    tag = Buffer.alloc(16);
    await input.read(tag, 0, 16, size - 16);
  } finally {
    await input.close();
  }
  let metadata: { database: string; iv: string };
  try {
    metadata = JSON.parse(header.subarray(magic.length).toString());
  } catch {
    throw new Error('Invalid backup metadata.');
  }
  if (
    typeof metadata.database !== 'string' ||
    !namePattern.test(metadata.database) ||
    typeof metadata.iv !== 'string' ||
    !/^[a-f0-9]{24}$/u.test(metadata.iv)
  )
    throw new Error('Invalid backup metadata.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(metadata.iv, 'hex'),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(file, { start: header.length, end: size - 17 }),
      decipher,
      createWriteStream(archive, { mode: 0o600, flags: 'wx' }),
    );
  } catch {
    throw new Error('Backup authentication failed. No database was touched.');
  }
  return metadata.database;
}

/** Restores only to a new, offline database. Existing data is never dropped. */
export async function restoreBackup(options: Options) {
  const target = databaseName(options.uri);
  if (!/^lancelio_restore_[a-zA-Z0-9_-]+$/u.test(target))
    throw new Error('Restore into a fresh lancelio_restore_<name> database.');
  const key = encryptionKey(options.key);
  return temporaryFiles(async (directory) => {
    const archive = join(directory, 'database.archive.gz');
    // GCM finalization must finish before opening a database connection.
    const source = await decryptBackup(options.file, key, archive);
    if (source === target)
      throw new Error('Restore database must differ from the source.');
    const connection = createConnection(options.uri, {
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
    try {
      await connection.asPromise();
      const db = connection.db!;
      if ((await db.listCollections({}, { nameOnly: true }).toArray()).length)
        throw new Error(
          'Restore target must have no collections. Use a new database after any failed attempt.',
        );
      // A fixed guard collection prevents two restore tools from claiming the same target.
      await db.createCollection('lancelio_restore_guard');
      await db.collection('lancelio_restore_guard').insertOne({
        _id: new Types.ObjectId('000000000000000000000001'),
        source,
        status: 'incomplete',
        startedAt: new Date(),
      });
      const config = await configuration(directory, options.uri);
      await runTool(options.toolsDirectory, 'mongorestore', [
        '--config',
        config,
        '--archive=' + archive,
        '--gzip',
        '--nsInclude=' + source + '.*',
        '--nsExclude=' + source + '.lancelio_restore_guard',
        '--nsFrom=' + source + '.*',
        '--nsTo=' + target + '.*',
        '--stopOnError',
        '--quiet',
      ]);
      const now = new Date();
      for (const name of [
        'authsessions',
        'consumedrefreshtokens',
        'passwordrecoveries',
        'recoverymailboxes',
      ])
        await db.collection(name).deleteMany({});
      for (const name of ['proposals', 'invoices']) {
        const updates: Record<string, unknown> = {
          'share.digest': null,
          'share.revokedAt': now,
        };
        if (name === 'proposals') updates['share.allowResponse'] = false;
        await db
          .collection(name)
          .updateMany(
            { share: { $ne: null } },
            { $set: updates, $inc: { version: 1 } },
          );
      }
      await db
        .collection('clientportalgrants')
        .updateMany(
          {},
          { $set: { digest: null, revokedAt: now }, $inc: { version: 1 } },
        );
      await db
        .collection('lancelio_restore_guard')
        .updateOne(
          {},
          { $set: { status: 'restored-access-revoked', completedAt: now } },
        );
      return { source, target };
    } finally {
      await connection.close();
    }
  });
}

// Used by operational checks without importing or reading the application .env.
export async function backupCommand(
  mode: string,
  file: string,
  environment: NodeJS.ProcessEnv,
) {
  const uri =
    environment[
      mode === 'backup' ? 'BACKUP_MONGODB_URI' : 'RESTORE_MONGODB_URI'
    ];
  if (
    !uri ||
    !environment.BACKUP_ENCRYPTION_KEY ||
    !environment.MONGODB_TOOLS_DIRECTORY ||
    !file
  )
    throw new Error(
      'Set the explicit backup/restore URI, BACKUP_ENCRYPTION_KEY, tools directory and output/input path.',
    );
  const options = {
    uri,
    key: environment.BACKUP_ENCRYPTION_KEY,
    toolsDirectory: environment.MONGODB_TOOLS_DIRECTORY,
    file,
  };
  if (mode === 'backup')
    return createBackup({
      ...options,
      writesPaused: environment.BACKUP_WRITES_PAUSED === 'yes',
    });
  if (mode === 'restore') return restoreBackup(options);
  throw new Error('Use backup or restore.');
}
