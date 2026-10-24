import type { Connection } from 'mongoose';
import type { PortalCollections } from '../modules/portal/infrastructure/mongo-portal-store.js';
import type { PortalModel } from '../modules/portal/infrastructure/portal-model.js';
import type { ClientAccessModel } from '../modules/portal/infrastructure/client-access-model.js';
import { MongoPortalStore } from '../modules/portal/infrastructure/mongo-portal-store.js';
import { MongoClientAccessStore } from '../modules/portal/infrastructure/mongo-client-access-store.js';
import { ManageClientAccess } from '../modules/portal/application/manage-client-access.js';
import { CryptoPortalSecrets } from '../modules/portal/infrastructure/portal-secrets.js';
import type { ClientInvitationMailer } from '../modules/portal/application/ports/client-access-store.js';
export function createClientAccess(
  db: Connection,
  model: ClientAccessModel,
  grants: PortalModel,
  names: PortalCollections & { users: string },
  mailer: ClientInvitationMailer | null,
  now: () => Date = () => new Date(),
) {
  return new ManageClientAccess(
    new MongoClientAccessStore(
      db,
      model,
      names,
      new MongoPortalStore(db, grants, names),
      now,
    ),
    new CryptoPortalSecrets(),
    mailer,
    now,
  );
}
