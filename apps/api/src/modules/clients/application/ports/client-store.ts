import type { ClientListQuery } from '../../domain/client-list.js';
import type { Client, ClientDetails, ClientPage } from '../../domain/client.js';
export interface ClientStore {
  create(workspaceId: string, details: ClientDetails): Promise<Client>;
  find(workspaceId: string, id: string): Promise<Client | null>;
  list(workspaceId: string, query: ClientListQuery): Promise<ClientPage>;
  update(
    workspaceId: string,
    id: string,
    version: number,
    details: ClientDetails,
  ): Promise<Client | null>;
  archive(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Client | null>;
}
