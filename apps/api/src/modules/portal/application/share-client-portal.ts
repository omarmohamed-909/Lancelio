import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
import {
  grantExpiry,
  grantState,
} from '../../../shared/domain/public-grant.js';
import { validatePortalVersion } from '../domain/client-portal.js';
import type {
  PortalOwnerRecord,
  PortalOwnerState,
  PortalCursors,
} from '../domain/client-portal.js';
import type { PortalStore, PortalSecrets } from './ports/portal-store.js';
export class ShareClientPortal {
  constructor(
    private readonly store: PortalStore,
    private readonly secrets: PortalSecrets,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private state(record: PortalOwnerRecord): PortalOwnerState {
    return {
      ...record,
      share: record.share
        ? { ...record.share, state: grantState(record.share, this.now()) }
        : null,
    };
  }
  private async current(scope: string, clientId: string, version?: number) {
    const workspace = validateId(scope),
      client = validateId(clientId);
    if (version !== undefined) validatePortalVersion(version);
    const record = await this.store.find(workspace, client);
    if (!record)
      throw new ApplicationError('CLIENT_NOT_FOUND', 'Client not found');
    if (version !== undefined && record.version !== version)
      throw new ApplicationError(
        'PORTAL_CONFLICT',
        'Portal changed; read the current grant',
      );
    return { workspace, client, record };
  }
  async read(scope: string, clientId: string) {
    return this.state((await this.current(scope, clientId)).record);
  }
  async issue(scope: string, clientId: string, version: number, days: number) {
    const now = this.now(),
      expiresAt = grantExpiry(days, now),
      current = await this.current(scope, clientId, version);
    if (current.record.client.archived)
      throw new ApplicationError(
        'CLIENT_ARCHIVED',
        'Archived clients cannot receive portal grants',
      );
    const secret = this.secrets.generate();
    const saved = await this.store.issue(
      current.workspace,
      current.client,
      version,
      { digest: secret.digest, issuedAt: now, expiresAt, revokedAt: null },
    );
    if (!saved)
      throw new ApplicationError(
        'PORTAL_CONFLICT',
        'Portal changed; read the current grant',
      );
    return { ...this.state(saved), token: secret.token };
  }
  async revoke(scope: string, clientId: string, version: number) {
    const current = await this.current(scope, clientId, version);
    if (!current.record.share)
      throw new ApplicationError(
        'PORTAL_SHARE_UNAVAILABLE',
        'Portal unavailable',
      );
    if (current.record.share.revokedAt) return this.state(current.record);
    const saved = await this.store.revoke(
      current.workspace,
      current.client,
      version,
      this.now(),
    );
    if (!saved)
      throw new ApplicationError(
        'PORTAL_CONFLICT',
        'Portal changed; read the current grant',
      );
    return this.state(saved);
  }
  async preview(scope: string, clientId: string, cursors: PortalCursors) {
    const { workspace, client } = await this.current(scope, clientId);
    const page = await this.store.preview(workspace, client, this.now(), {
      projects: cursors.projects === null ? null : validateId(cursors.projects),
      invoices: cursors.invoices === null ? null : validateId(cursors.invoices),
    });
    if (!page)
      throw new ApplicationError('CLIENT_NOT_FOUND', 'Client not found');
    return page;
  }
  async readPublic(token: string, cursors: PortalCursors) {
    const unavailable = () =>
      new ApplicationError('PORTAL_SHARE_UNAVAILABLE', 'Portal unavailable');
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw unavailable();
    const digest = this.secrets.digest(token),
      now = this.now();
    const decoded = {
      projects:
        cursors.projects === null
          ? null
          : this.secrets.decodeCursor(digest, 'projects', cursors.projects),
      invoices:
        cursors.invoices === null
          ? null
          : this.secrets.decodeCursor(digest, 'invoices', cursors.invoices),
    };
    if (
      (cursors.projects !== null && decoded.projects === null) ||
      (cursors.invoices !== null && decoded.invoices === null)
    )
      throw unavailable();
    const page = await this.store.findPublic(digest, now, decoded);
    if (!page) throw unavailable();
    return {
      ...page,
      nextProjectCursor:
        page.nextProjectCursor === null
          ? null
          : this.secrets.encodeCursor(
              digest,
              'projects',
              page.nextProjectCursor,
            ),
      nextInvoiceCursor:
        page.nextInvoiceCursor === null
          ? null
          : this.secrets.encodeCursor(
              digest,
              'invoices',
              page.nextInvoiceCursor,
            ),
      validForSeconds: Math.ceil(
        (page.expiresAt.getTime() - now.getTime()) / 1000,
      ),
    };
  }
}
