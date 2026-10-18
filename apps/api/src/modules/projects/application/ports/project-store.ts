import type {
  AcceptedProjectInput,
  ManualProjectInput,
  Project,
  ProjectClient,
  ProjectListQuery,
  ProjectPage,
  ProjectStatus,
} from '../../domain/project.js';
export interface ProjectStore {
  createAccepted(input: AcceptedProjectInput): Promise<Project>;
  createManual(
    workspaceId: string,
    input: ManualProjectInput,
    client: ProjectClient,
  ): Promise<Project>;
  find(workspaceId: string, id: string): Promise<Project | null>;
  list(workspaceId: string, query: ProjectListQuery): Promise<ProjectPage>;
  changeStatus(
    workspaceId: string,
    id: string,
    version: number,
    current: ProjectStatus,
    next: ProjectStatus,
  ): Promise<Project | null>;
}
export interface ProjectClientDirectory {
  reserve(workspaceId: string, clientId: string): Promise<ProjectClient | null>;
}
export interface ProjectTransactionContext {
  projects: ProjectStore;
  clients: ProjectClientDirectory;
}
export interface ProjectTransactions {
  execute<T>(
    action: (context: ProjectTransactionContext) => Promise<T>,
  ): Promise<T>;
}
