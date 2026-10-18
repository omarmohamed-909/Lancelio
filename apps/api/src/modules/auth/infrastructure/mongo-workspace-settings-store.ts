import type { ClientSession } from 'mongoose';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import { unauthenticated } from '../domain/session.js';
import {
  canEditWorkspace,
  workspaceAccessDenied,
} from '../domain/workspace-settings.js';
import type { WorkspaceSettingsScope } from '../domain/workspace-settings.js';
import type { WorkspaceSettingsStore } from '../application/ports/workspace-settings-store.js';
import type { RegistrationModels } from './registration-models.js';

export class MongoWorkspaceSettingsStore implements WorkspaceSettingsStore {
  constructor(private readonly models: RegistrationModels) {}

  private async find(scope: WorkspaceSettingsScope, session?: ClientSession) {
    const user = await this.models.User.findOne({
      _id: scope.userId,
      status: 'active',
    })
      .select('_id')
      .session(session ?? null)
      .lean();
    const membership = await this.models.Membership.findOne({
      user: scope.userId,
      workspace: scope.workspaceId,
    })
      .select('role')
      .session(session ?? null)
      .lean();
    const workspace = await this.models.Workspace.findById(scope.workspaceId)
      .select('name slug owner settingsVersion')
      .session(session ?? null)
      .lean();
    if (!user) throw unauthenticated();
    if (!membership || !workspace) throw workspaceAccessDenied();
    return {
      id: workspace._id.toString(),
      name: workspace.name,
      slug: workspace.slug,
      version: workspace.settingsVersion ?? 0,
      role: membership.role,
      canEdit: canEditWorkspace(
        membership.role,
        workspace.owner.toString(),
        scope.userId,
      ),
    };
  }

  read(scope: WorkspaceSettingsScope) {
    return this.find(scope);
  }

  async update(scope: WorkspaceSettingsScope, name: string, version: number) {
    const session = await this.models.Workspace.db.startSession();
    try {
      const result = await session.withTransaction(async () => {
        // Writes fence active status and owner membership against concurrent revocation.
        // Internal counters do not change membership identity, role or timestamps.
        const active = await this.models.User.updateOne(
          { _id: scope.userId, status: 'active' },
          { $inc: { authFence: 1 } },
          { session, timestamps: false },
        );
        if (!active.matchedCount) throw unauthenticated();
        const owner = await this.models.Membership.updateOne(
          { user: scope.userId, workspace: scope.workspaceId, role: 'owner' },
          { $inc: { settingsFence: 1 } },
          { session, timestamps: false },
        );
        if (!owner.matchedCount) throw workspaceAccessDenied();
        const current = await this.find(scope, session);
        if (!current.canEdit) throw workspaceAccessDenied();
        if (current.version !== version)
          throw new ApplicationError(
            'WORKSPACE_CONFLICT',
            'Workspace settings have changed',
          );
        if (current.name === name) return current;
        const workspace = await this.models.Workspace.findOneAndUpdate(
          {
            _id: scope.workspaceId,
            owner: scope.userId,
            ...(version === 0
              ? {
                  $or: [
                    { settingsVersion: 0 },
                    { settingsVersion: { $exists: false } },
                  ],
                }
              : { settingsVersion: version }),
          },
          { $set: { name }, $inc: { settingsVersion: 1 } },
          { session, returnDocument: 'after', runValidators: true },
        )
          .select('name slug settingsVersion')
          .lean();
        if (!workspace)
          throw new ApplicationError(
            'WORKSPACE_CONFLICT',
            'Workspace settings have changed',
          );
        return {
          ...current,
          name: workspace.name,
          version: workspace.settingsVersion ?? 0,
        };
      });
      if (!result)
        throw new Error('Workspace settings transaction did not complete');
      return result;
    } finally {
      await session.endSession();
    }
  }
}
