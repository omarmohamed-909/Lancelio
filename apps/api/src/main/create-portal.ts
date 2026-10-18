import type { Connection } from 'mongoose';
import type { PortalModel } from '../modules/portal/infrastructure/portal-model.js';
import type { PortalCollections } from '../modules/portal/infrastructure/mongo-portal-store.js';
import { MongoPortalStore } from '../modules/portal/infrastructure/mongo-portal-store.js';
import { CryptoPortalSecrets } from '../modules/portal/infrastructure/portal-secrets.js';
import { ShareClientPortal } from '../modules/portal/application/share-client-portal.js';
export function createPortal(
  database: Connection,
  grants: PortalModel,
  collections: PortalCollections,
  now: () => Date = () => new Date(),
) {
  return new ShareClientPortal(
    new MongoPortalStore(database, grants, collections),
    new CryptoPortalSecrets(),
    now,
  );
}
