import type {
  PortalOwnerRecord,
  PortalPage,
  PortalCursors,
} from '../../domain/client-portal.js';
import type { PublicGrant } from '../../../../shared/domain/public-grant.js';
export interface PortalStore {
  find(
    workspaceId: string,
    clientId: string,
  ): Promise<PortalOwnerRecord | null>;
  issue(
    workspaceId: string,
    clientId: string,
    version: number,
    grant: PublicGrant & { digest: string },
  ): Promise<PortalOwnerRecord | null>;
  revoke(
    workspaceId: string,
    clientId: string,
    version: number,
    now: Date,
  ): Promise<PortalOwnerRecord | null>;
  preview(
    workspaceId: string,
    clientId: string,
    now: Date,
    cursors: PortalCursors,
  ): Promise<PortalPage | null>;
  findPublic(
    digest: string,
    now: Date,
    cursors: PortalCursors,
  ): Promise<(PortalPage & { expiresAt: Date }) | null>;
}
export interface PortalSecrets {
  generate(): { token: string; digest: string };
  digest(token: string): string;
  encodeCursor(
    digest: string,
    kind: 'projects' | 'invoices',
    id: string,
  ): string;
  decodeCursor(
    digest: string,
    kind: 'projects' | 'invoices',
    cursor: string,
  ): string | null;
}
