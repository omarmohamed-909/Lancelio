import { ManageWorkspaceSettings } from '../modules/auth/application/manage-workspace-settings.js';
import { MongoWorkspaceSettingsStore } from '../modules/auth/infrastructure/mongo-workspace-settings-store.js';
import type { RegistrationModels } from '../modules/auth/infrastructure/registration-models.js';

export function createWorkspaceSettings(models: RegistrationModels) {
  return new ManageWorkspaceSettings(new MongoWorkspaceSettingsStore(models));
}
