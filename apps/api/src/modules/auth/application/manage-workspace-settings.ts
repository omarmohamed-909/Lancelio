import type { WorkspaceSettingsScope } from '../domain/workspace-settings.js';
import { validateWorkspaceChange } from '../domain/workspace-settings.js';
import type { WorkspaceSettingsStore } from './ports/workspace-settings-store.js';

export class ManageWorkspaceSettings {
  constructor(private readonly store: WorkspaceSettingsStore) {}
  read(scope: WorkspaceSettingsScope) {
    return this.store.read(scope);
  }
  update(
    scope: WorkspaceSettingsScope,
    input: { name: string; version: number },
  ) {
    const change = validateWorkspaceChange(input);
    return this.store.update(scope, change.name, change.version);
  }
}
