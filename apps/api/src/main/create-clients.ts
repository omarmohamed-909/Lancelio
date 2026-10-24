import { ManageClients } from '../modules/clients/application/manage-clients.js';
import { MongoClientStore } from '../modules/clients/infrastructure/mongo-client-store.js';
import { InternationalPhoneNumbers } from '../modules/clients/infrastructure/international-phone-numbers.js';
import type { ClientModel } from '../modules/clients/infrastructure/client-model.js';
export function createClients(model: ClientModel) {
  return new ManageClients(
    new MongoClientStore(model),
    new InternationalPhoneNumbers(),
  );
}
