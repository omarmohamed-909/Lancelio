import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  validateId,
  validateVersion,
} from '../../../shared/domain/identifiers.js';
import {
  assertProjectTransition,
  validateManualProject,
  validateProjectList,
  validateProjectStatus,
} from '../domain/project.js';
import type {
  AcceptedProjectInput,
  ManualProjectInput,
  ProjectListInput,
} from '../domain/project.js';
import type {
  ProjectStore,
  ProjectTransactions,
} from './ports/project-store.js';
export class ManageProjects {
  constructor(
    private readonly store: ProjectStore,
    private readonly transactions?: ProjectTransactions,
  ) {}
  createAccepted(input: AcceptedProjectInput) {
    return this.store.createAccepted({
      ...input,
      workspaceId: validateId(input.workspaceId),
      sourceProposalId: validateId(input.sourceProposalId),
      client: { ...input.client, id: validateId(input.client.id) },
    });
  }
  create(workspaceId: string, input: ManualProjectInput) {
    const scope = validateId(workspaceId);
    const content = validateManualProject(input);
    if (!this.transactions)
      throw new Error('Project creation requires transactions');
    return this.transactions.execute(async ({ projects, clients }) => {
      const client = await clients.reserve(scope, content.clientId);
      if (!client)
        throw new ApplicationError(
          'PROJECT_CLIENT_UNAVAILABLE',
          'Choose an active client from this workspace',
        );
      return projects.createManual(scope, content, client);
    });
  }
  list(workspaceId: string, input: ProjectListInput) {
    return this.store.list(validateId(workspaceId), validateProjectList(input));
  }
  async read(workspaceId: string, id: string) {
    const project = await this.store.find(
      validateId(workspaceId),
      validateId(id),
    );
    if (!project)
      throw new ApplicationError('PROJECT_NOT_FOUND', 'Project not found');
    return project;
  }
  async changeStatus(
    workspaceId: string,
    id: string,
    version: number,
    status: string,
  ) {
    const scope = validateId(workspaceId);
    const projectId = validateId(id);
    validateVersion(version);
    const next = validateProjectStatus(status);
    const current = await this.read(scope, projectId);
    if (current.version !== version)
      throw new ApplicationError(
        'PROJECT_CONFLICT',
        'Project changed; reload before trying again',
      );
    assertProjectTransition(current.status, next);
    const result = await this.store.changeStatus(
      scope,
      projectId,
      version,
      current.status,
      next,
    );
    if (!result) {
      await this.read(scope, projectId);
      throw new ApplicationError(
        'PROJECT_CONFLICT',
        'Project changed; reload before trying again',
      );
    }
    return result;
  }
}
