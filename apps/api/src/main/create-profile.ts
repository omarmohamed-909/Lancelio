import { ManageProfile } from '../modules/auth/application/manage-profile.js';
import { MongoProfileStore } from '../modules/auth/infrastructure/mongo-profile-store.js';
import type { RegistrationModels } from '../modules/auth/infrastructure/registration-models.js';

export function createProfile(users: RegistrationModels['User']) {
  return new ManageProfile(new MongoProfileStore(users));
}
