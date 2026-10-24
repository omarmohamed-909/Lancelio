import type { ClientAccess } from '../../domain/client-access.js';
import type { PortalCursors, PortalPage } from '../../domain/client-portal.js';
export interface ClientAccessStore {
  owner(
    workspaceId: string,
    clientId: string,
  ): Promise<{ email: string; version: number; access: ClientAccess | null }>;
  issue(
    workspaceId: string,
    clientId: string,
    version: number,
    digest: string,
    expiresAt: Date,
    expectedEmail: string,
  ): Promise<ClientAccess>;
  revoke(workspaceId: string, clientId: string, version: number): Promise<void>;
  list(
    userId: string,
    after: string | null,
  ): Promise<{
    verificationRequired: boolean;
    items: ClientAccess[];
    hasMore: boolean;
    nextCursor: string | null;
  }>;
  resolve(userId: string, digest: string): Promise<ClientAccess>;
  decide(
    userId: string,
    id: string,
    version: number,
    accept: boolean,
    digest: string | null,
  ): Promise<void>;
  leave(userId: string, id: string, version: number): Promise<void>;
  page(userId: string, id: string, cursors: PortalCursors): Promise<PortalPage>;
}
export interface ClientInvitationMailer {
  send(access: ClientAccess, token: string, locale: 'ar' | 'en'): Promise<void>;
}
