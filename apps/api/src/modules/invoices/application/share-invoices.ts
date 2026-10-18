import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  validateId,
  validateVersion,
} from '../../../shared/domain/identifiers.js';
import {
  grantExpiry,
  grantState,
} from '../../../shared/domain/public-grant.js';
import type { InvoiceShareState } from '../domain/invoice-share.js';
import type {
  InvoiceShareStore,
  InvoiceShareTokens,
  SharedInvoiceRecord,
} from './ports/invoice-share-store.js';
export class ShareInvoices {
  constructor(
    private readonly store: InvoiceShareStore,
    private readonly tokens: InvoiceShareTokens,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private state(record: SharedInvoiceRecord, now: Date): InvoiceShareState {
    return {
      invoiceVersion: record.invoice.version,
      invoiceStatus: record.invoice.status,
      updatedAt: record.invoice.updatedAt,
      share: record.grant
        ? { ...record.grant, state: grantState(record.grant, now) }
        : null,
    };
  }
  private async current(scope: string, id: string, version?: number) {
    const workspaceId = validateId(scope),
      invoiceId = validateId(id);
    if (version !== undefined) validateVersion(version);
    const record = await this.store.find(workspaceId, invoiceId);
    if (!record)
      throw new ApplicationError('INVOICE_NOT_FOUND', 'Invoice not found');
    if (version !== undefined && record.invoice.version !== version)
      throw new ApplicationError(
        'INVOICE_CONFLICT',
        'Invoice changed; reload before sharing',
      );
    return { workspaceId, invoiceId, record };
  }
  async read(scope: string, id: string) {
    const { record } = await this.current(scope, id);
    return this.state(record, this.now());
  }
  async issue(scope: string, id: string, version: number, days: number) {
    const now = this.now(),
      expiresAt = grantExpiry(days, now),
      { workspaceId, invoiceId, record } = await this.current(
        scope,
        id,
        version,
      );
    if (record.invoice.status !== 'issued')
      throw new ApplicationError(
        'INVOICE_NOT_ISSUED',
        'Issue the invoice before sharing',
      );
    const secret = this.tokens.generate();
    const saved = await this.store.issue(workspaceId, invoiceId, version, {
      digest: secret.digest,
      issuedAt: now,
      expiresAt,
      revokedAt: null,
    });
    if (!saved)
      throw new ApplicationError(
        'INVOICE_CONFLICT',
        'Invoice changed; reload before sharing',
      );
    return { ...this.state(saved, now), token: secret.token };
  }
  async revoke(scope: string, id: string, version: number) {
    const now = this.now(),
      { workspaceId, invoiceId, record } = await this.current(
        scope,
        id,
        version,
      );
    if (!record.grant)
      throw new ApplicationError(
        'INVOICE_SHARE_UNAVAILABLE',
        'Sharing link unavailable',
      );
    if (record.grant.revokedAt) return this.state(record, now);
    const saved = await this.store.revoke(workspaceId, invoiceId, version, now);
    if (!saved)
      throw new ApplicationError(
        'INVOICE_CONFLICT',
        'Invoice changed; reload before revoking',
      );
    return this.state(saved, now);
  }
  async readPublic(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
      throw new ApplicationError(
        'INVOICE_SHARE_UNAVAILABLE',
        'Sharing link unavailable',
      );
    const now = this.now(),
      document = await this.store.findPublic(this.tokens.digest(token), now);
    if (!document)
      throw new ApplicationError(
        'INVOICE_SHARE_UNAVAILABLE',
        'Sharing link unavailable',
      );
    return {
      ...document,
      validForSeconds: Math.ceil(
        (document.expiresAt.getTime() - now.getTime()) / 1000,
      ),
    };
  }
}
