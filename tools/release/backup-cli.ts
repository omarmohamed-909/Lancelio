import process from 'node:process';
import { backupCommand } from './database-backup.js';

try {
  const result = await backupCommand(
    process.argv[2] ?? '',
    process.argv[3] ?? '',
    process.env,
  );
  console.info(JSON.stringify(result));
} catch {
  console.error(
    'Backup operation failed. Check the explicit configuration, tools, key, maintenance acknowledgement and fresh restore target. Never reuse an incomplete restore target.',
  );
  process.exitCode = 1;
}
