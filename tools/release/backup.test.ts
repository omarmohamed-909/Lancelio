import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createBackup, restoreBackup } from './database-backup.js';
import { mongoBinaryOptions } from '../../apps/api/tests/helpers/mongo-binary.js';
import {
  checkDatabaseReadiness,
  connectDatabase,
} from '../../apps/api/src/main/database.js';
import { createInvoices } from '../../apps/api/src/main/create-invoices.js';
import { createInvoiceSharing } from '../../apps/api/src/main/create-invoice-sharing.js';
import { createPayments } from '../../apps/api/src/main/create-payments.js';
import {
  createInvoiceModels,
  initializeInvoiceModels,
} from '../../apps/api/src/modules/invoices/infrastructure/invoice-model.js';
import { createPaymentLedgerModel } from '../../apps/api/src/modules/payments/infrastructure/payment-ledger-model.js';
import { createClientModel } from '../../apps/api/src/modules/clients/infrastructure/client-model.js';
import { createProjectModel } from '../../apps/api/src/modules/projects/infrastructure/project-model.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../../apps/api/src/modules/auth/infrastructure/registration-models.js';

test(
  'real encrypted BSON restore preserves exact financial history/indexes and revokes sessions and public grants',
  { timeout: 180_000 },
  async (t) => {
    const toolsDirectory = process.env.MONGODB_TOOLS_DIRECTORY;
    assert.ok(
      toolsDirectory,
      'Set MONGODB_TOOLS_DIRECTORY to the official Database Tools bin directory.',
    );
    const temporaryRoot = resolve(tmpdir());
    const directory = await mkdtemp(
      join(temporaryRoot, 'lancelio-backup-drill-'),
    );
    const replica = await MongoMemoryReplSet.create({
      binary: {
        ...mongoBinaryOptions(),
        downloadDir: resolve('.cache/mongodb-binaries'),
      },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    const database = await connectDatabase(
      replica.getUri('release_backup_source'),
    );
    const target = 'lancelio_restore_' + randomBytes(6).toString('hex');
    const key = randomBytes(32).toString('hex');
    const file = join(directory, 'backup.lancelio');
    try {
      const models = createRegistrationModels(database);
      await initializeRegistrationModels(models);
      const user = await models.User.create({
        name: 'Restore test owner',
        email: 'restore@example.com',
        passwordHash: 'opaque-test-hash',
      });
      const workspace = await models.Workspace.create({
        name: 'Restore test workspace',
        slug: 'restore-test-workspace',
        owner: user.id,
      });
      await models.Membership.create({
        workspace: workspace.id,
        user: user.id,
        role: 'owner',
      });
      const clients = createClientModel(database),
        projects = createProjectModel(database);
      await clients.createCollection();
      await clients.createIndexes();
      await projects.createCollection();
      await projects.createIndexes();
      const client = await clients.create({
        workspace: workspace.id,
        name: 'Restore test client',
        email: '',
        phone: '',
        company: '',
        notes: '',
        version: 1,
      });
      const invoices = createInvoiceModels(database);
      await initializeInvoiceModels(invoices);
      const ledger = createPaymentLedgerModel(database);
      await ledger.createCollection();
      await ledger.createIndexes();
      const service = createInvoices(database, invoices, clients, projects);
      const draft = await service.create(workspace.id, {
        requestId: randomUUID(),
        clientId: client.id,
        projectId: null,
        title: 'Restore financial snapshot',
        summary: 'Preserve this agreement',
        terms: '',
        currency: 'EGP',
        items: [{ title: 'Work', quantity: 1, unitPrice: '1500.50' }],
      });
      const issued = await service.issue(
        workspace.id,
        draft.id,
        draft.version,
        workspace.name,
      );
      await createInvoiceSharing(invoices).issue(
        workspace.id,
        draft.id,
        issued.version,
        7,
      );
      const payments = createPayments(ledger, invoices.Invoice);
      const first = await payments.add(workspace.id, draft.id, 0, {
        requestId: randomUUID(),
        amount: '500.25',
        paidOn: new Date().toISOString().slice(0, 10),
        method: 'bank_transfer',
        reference: 'bank-01',
        memo: '',
      });
      const second = await payments.add(workspace.id, draft.id, first.version, {
        requestId: randomUUID(),
        amount: '1000.25',
        paidOn: new Date().toISOString().slice(0, 10),
        method: 'cash',
        reference: '',
        memo: '',
      });
      await payments.void(
        workspace.id,
        draft.id,
        second.payments[1]!.id,
        second.version,
        'Correction preserved after restore',
      );
      const before = await invoices.Invoice.findById(draft.id).lean().orFail();
      const ledgerBefore = await ledger.findOne().lean().orFail();
      const financialBefore = await payments.read(workspace.id, draft.id);
      const counterBefore = await invoices.Counter.findOne().lean().orFail();
      const db = database.db!;
      for (const collection of [
        'authsessions',
        'consumedrefreshtokens',
        'passwordrecoveries',
        'recoverymailboxes',
      ])
        await db.collection(collection).insertOne({ marker: 'old-access' });
      await db
        .collection('clientportalgrants')
        .insertOne({ version: 3, digest: 'old-secret', issuedAt: new Date() });
      await db.collection('proposals').insertOne({
        version: 4,
        status: 'accepted',
        totalMinor: 150050,
        decision: { outcome: 'accepted' },
        share: { digest: 'old-secret', allowResponse: true },
      });
      await t.test(
        'readiness checks a live database and detects a closed connection',
        async () => {
          assert.equal(await checkDatabaseReadiness(database), true);
          const closed = await connectDatabase(replica.getUri('closed_probe'));
          await closed.close();
          assert.equal(await checkDatabaseReadiness(closed), false);
        },
      );
      const options = {
        uri: replica.getUri('release_backup_source'),
        key,
        toolsDirectory,
        file,
      };
      await t.test(
        'maintenance must be explicit and existing backup files are never overwritten',
        async () => {
          await assert.rejects(
            createBackup({ ...options, writesPaused: false }),
            /Stop all writers/,
          );
          await writeFile(file, 'existing');
          await assert.rejects(
            createBackup({ ...options, writesPaused: true }),
          );
          assert.equal(await readFile(file, 'utf8'), 'existing');
          await rm(file);
        },
      );
      await createBackup({ ...options, writesPaused: true });
      const envelope = await readFile(file);
      assert.ok(!envelope.includes(Buffer.from('Restore financial snapshot')));
      const restore = { ...options, uri: replica.getUri(target) };
      await t.test(
        'wrong keys and modified ciphertext fail before any target write',
        async () => {
          await assert.rejects(
            restoreBackup({ ...restore, key: randomBytes(32).toString('hex') }),
            /authentication failed/,
          );
          const broken = Buffer.from(envelope);
          broken[broken.length - 20]! ^= 1;
          const corruptFile = join(directory, 'corrupt.lancelio');
          await writeFile(corruptFile, broken);
          await assert.rejects(
            restoreBackup({ ...restore, file: corruptFile }),
            /authentication failed/,
          );
          assert.deepEqual(
            await db
              .admin()
              .listDatabases()
              .then((result) =>
                result.databases.filter((database) => database.name === target),
              ),
            [],
          );
        },
      );
      await t.test(
        'ordinary application databases cannot be restore targets',
        async () => {
          await assert.rejects(
            restoreBackup(options),
            /fresh lancelio_restore/,
          );
        },
      );
      await restoreBackup(restore);
      const restored = await connectDatabase(restore.uri);
      try {
        const restoredInvoices = createInvoiceModels(restored);
        const restoredLedger = createPaymentLedgerModel(restored);
        const after = await restoredInvoices.Invoice.findById(draft.id)
          .lean()
          .orFail();
        const { share: oldShare, version: oldVersion, ...oldSnapshot } = before;
        const { share: newShare, version: newVersion, ...newSnapshot } = after;
        assert.deepEqual(newSnapshot, oldSnapshot);
        assert.equal(newVersion, oldVersion + 1);
        assert.ok(oldShare?.digest);
        assert.equal(newShare?.digest, null);
        assert.ok(newShare?.revokedAt);
        assert.deepEqual(await restoredLedger.findOne().lean(), ledgerBefore);
        assert.deepEqual(
          await createPayments(restoredLedger, restoredInvoices.Invoice).read(
            workspace.id,
            draft.id,
          ),
          financialBefore,
        );
        assert.deepEqual(
          await restoredInvoices.Counter.findOne().lean(),
          counterBefore,
        );
        assert.deepEqual(
          await restoredInvoices.Invoice.collection.indexes(),
          await invoices.Invoice.collection.indexes(),
        );
        for (const name of [
          'authsessions',
          'consumedrefreshtokens',
          'passwordrecoveries',
          'recoverymailboxes',
        ])
          assert.equal(await restored.db!.collection(name).countDocuments(), 0);
        assert.equal(
          (await restored.db!.collection('clientportalgrants').findOne())!
            .digest,
          null,
        );
        const proposal = await restored.db!.collection('proposals').findOne();
        assert.deepEqual(proposal!.decision, { outcome: 'accepted' });
        assert.equal(proposal!.share.allowResponse, false);
        await assert.rejects(restoreBackup(restore), /no collections/);
        assert.equal(await invoices.Invoice.countDocuments(), 1);
        assert.ok(
          (await invoices.Invoice.findById(draft.id).orFail()).share?.digest,
        );
        await t.test(
          'a previously restored database can be backed up and restored again',
          async () => {
            const repeat = {
              ...restore,
              file: join(directory, 'second-backup.lancelio'),
            };
            await createBackup({ ...repeat, writesPaused: true });
            const nextTarget =
              'lancelio_restore_' + randomBytes(6).toString('hex');
            await restoreBackup({ ...repeat, uri: replica.getUri(nextTarget) });
            const secondRestore = await connectDatabase(
              replica.getUri(nextTarget),
            );
            try {
              assert.equal(
                await secondRestore.db!.collection('invoices').countDocuments(),
                1,
              );
              assert.equal(
                (await secondRestore
                  .db!.collection('lancelio_restore_guard')
                  .findOne())!.source,
                target,
              );
              assert.equal(
                (await secondRestore
                  .db!.collection('lancelio_restore_guard')
                  .findOne())!.status,
                'restored-access-revoked',
              );
            } finally {
              await secondRestore.close();
            }
          },
        );
      } finally {
        await restored.close();
      }
    } finally {
      await database.close();
      await replica.stop();
      // Exact directory created by mkdtemp above; no supplied cleanup path.
      assert.equal(dirname(resolve(directory)), temporaryRoot);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
