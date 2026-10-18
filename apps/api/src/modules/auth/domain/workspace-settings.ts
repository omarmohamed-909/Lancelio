import { ApplicationError } from '../../../shared/domain/application-error.js';
import { isValidDisplayName } from './display-name.js';

export interface WorkspaceSettings {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly version: number;
  readonly role: 'owner' | 'admin' | 'member';
  readonly canEdit: boolean;
}

export interface WorkspaceSettingsScope {
  readonly userId: string;
  readonly workspaceId: string;
}

export function canEditWorkspace(
  role: WorkspaceSettings['role'],
  actualOwnerId: string,
  userId: string,
) {
  return role === 'owner' && actualOwnerId === userId;
}

export function validateWorkspaceChange(input: {
  name: string;
  version: number;
}) {
  const name = input.name.trim();
  if (
    !isValidDisplayName(name) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    input.version >= Number.MAX_SAFE_INTEGER
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid workspace settings',
    );
  return { name, version: input.version };
}

export function workspaceAccessDenied() {
  return new ApplicationError(
    'WORKSPACE_ACCESS_DENIED',
    'Workspace owner access is required',
  );
}
