import { validateClientList } from '../domain/client-list.js';
import type { ClientListInput } from '../domain/client-list.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  validateDetails,
  validateId,
  validateVersion,
} from '../domain/client.js';
import type {
  Client,
  ClientDetails,
  ClientPhoneNumbers,
} from '../domain/client.js';
import type { ClientStore } from './ports/client-store.js';
export class ManageClients {
  constructor(
    private readonly store: ClientStore,
    private readonly phones: ClientPhoneNumbers,
  ) {}
  create(workspaceId: string, details: ClientDetails) {
    return this.store.create(
      validateId(workspaceId),
      validateDetails(details, this.phones),
    );
  }
  list(workspaceId: string, query: ClientListInput) {
    return this.store.list(validateId(workspaceId), validateClientList(query));
  }
  async read(workspaceId: string, id: string): Promise<Client> {
    const client = await this.store.find(
      validateId(workspaceId),
      validateId(id),
    );
    if (!client)
      throw new ApplicationError('CLIENT_NOT_FOUND', 'Client not found');
    return client;
  }
  async update(
    workspaceId: string,
    id: string,
    version: number,
    details: ClientDetails,
  ) {
    validateVersion(version);
    const clean = validateDetails(details, this.phones);
    const scope = validateId(workspaceId);
    const clientId = validateId(id);
    const result = await this.store.update(scope, clientId, version, clean);
    return result ?? this.explainConflict(scope, clientId);
  }
  async archive(workspaceId: string, id: string, version: number) {
    validateVersion(version);
    const scope = validateId(workspaceId);
    const clientId = validateId(id);
    const result = await this.store.archive(scope, clientId, version);
    return result ?? this.explainConflict(scope, clientId);
  }
  private async explainConflict(
    workspaceId: string,
    id: string,
  ): Promise<never> {
    const client = await this.read(workspaceId, id);
    throw new ApplicationError(
      client.archivedAt ? 'CLIENT_ARCHIVED' : 'CLIENT_CONFLICT',
      client.archivedAt
        ? 'Archived clients cannot be changed'
        : 'Client changed; reload before trying again',
    );
  }
}
