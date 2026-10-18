import { createConnection } from 'mongoose';
import type { Connection } from 'mongoose';

export async function checkDatabaseReadiness(connection: Connection) {
  if (connection.readyState !== 1 || !connection.db) return false;
  const result = await connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
  return result.ok === 1;
}

export async function connectDatabase(uri: string) {
  const connection = createConnection(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await connection.asPromise();
    const hello = await connection.db?.admin().command({ hello: 1 });
    if (!hello?.setName && hello?.msg !== 'isdbgrid') {
      throw new Error(
        'MongoDB must support transactions: use a replica set or a sharded cluster',
      );
    }
    return connection;
  } catch (error: unknown) {
    await connection.close();
    throw error;
  }
}
