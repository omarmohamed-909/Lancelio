import { validateId } from '../../../shared/domain/identifiers.js';
import type { WorkspaceOverview } from '../domain/workspace-overview.js';
export interface WorkspaceOverviewReader {
  read(workspaceId: string, now: Date): Promise<WorkspaceOverview>;
}
export class ReadWorkspaceOverview {
  constructor(
    private readonly reader: WorkspaceOverviewReader,
    private readonly now: () => Date = () => new Date(),
  ) {}
  execute(workspaceId: string) {
    return this.reader.read(validateId(workspaceId), this.now());
  }
}
