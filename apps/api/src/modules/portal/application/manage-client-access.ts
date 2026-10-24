import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
import { validatePortalVersion } from '../domain/client-portal.js';
import type { AccessIdentity } from '../domain/client-access.js';
import type { PortalCursors } from '../domain/client-portal.js';
import type { PortalSecrets } from './ports/portal-store.js';
import type {
  ClientAccessStore,
  ClientInvitationMailer,
} from './ports/client-access-store.js';
export class ManageClientAccess {
  constructor(
    private readonly store: ClientAccessStore,
    private readonly secrets: PortalSecrets,
    private readonly mailer: ClientInvitationMailer | null,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private owner(identity: AccessIdentity, clientId: string) {
    if (!['owner', 'admin'].includes(identity.role))
      throw new ApplicationError(
        'WORKSPACE_ACCESS_DENIED',
        'Owner access required',
      );
    return {
      workspace: validateId(identity.workspaceId),
      client: validateId(clientId),
    };
  }
  private digest(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
      throw new ApplicationError(
        'CLIENT_INVITATION_UNAVAILABLE',
        'Invitation unavailable',
      );
    return this.secrets.digest(token);
  }
  readOwner(identity: AccessIdentity, clientId: string) {
    const { workspace, client } = this.owner(identity, clientId);
    return this.store.owner(workspace, client);
  }
  async issue(
    identity: AccessIdentity,
    clientId: string,
    version: number,
    locale: 'ar' | 'en',
    email: string,
  ) {
    const { workspace, client } = this.owner(identity, clientId);
    validatePortalVersion(version);
    const secret = this.secrets.generate();
    const access = await this.store.issue(
      workspace,
      client,
      version,
      secret.digest,
      new Date(this.now().getTime() + 7 * 86400000),
      email.trim().toLowerCase(),
    );
    let delivery: 'accepted' | 'unavailable' | 'failed' = 'unavailable';
    if (this.mailer) {
      try {
        await this.mailer.send(access, secret.token, locale);
        delivery = 'accepted';
      } catch {
        delivery = 'failed';
      }
    }
    return { access, token: secret.token, delivery };
  }
  revoke(identity: AccessIdentity, clientId: string, version: number) {
    const { workspace, client } = this.owner(identity, clientId);
    validatePortalVersion(version);
    return this.store.revoke(workspace, client, version);
  }
  list(userId: string, after: string | null = null) {
    return this.store.list(
      validateId(userId),
      after === null ? null : validateId(after),
    );
  }
  resolve(userId: string, token: string) {
    return this.store.resolve(validateId(userId), this.digest(token));
  }
  decide(
    userId: string,
    id: string,
    version: number,
    accept: boolean,
    token: string | null,
  ) {
    validatePortalVersion(version);
    return this.store.decide(
      validateId(userId),
      validateId(id),
      version,
      accept,
      token === null ? null : this.digest(token),
    );
  }
  leave(userId: string, id: string, version: number) {
    validatePortalVersion(version);
    return this.store.leave(validateId(userId), validateId(id), version);
  }
  page(userId: string, id: string, cursors: PortalCursors) {
    return this.store.page(validateId(userId), validateId(id), {
      projects: cursors.projects === null ? null : validateId(cursors.projects),
      invoices: cursors.invoices === null ? null : validateId(cursors.invoices),
    });
  }
}
