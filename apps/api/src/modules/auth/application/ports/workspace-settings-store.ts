import type {
  WorkspaceSettings,
  WorkspaceSettingsScope,
} from '../../domain/workspace-settings.js';

export interface WorkspaceSettingsStore {
  read(scope: WorkspaceSettingsScope): Promise<WorkspaceSettings>;
  update(
    scope: WorkspaceSettingsScope,
    name: string,
    version: number,
  ): Promise<WorkspaceSettings>;
}
