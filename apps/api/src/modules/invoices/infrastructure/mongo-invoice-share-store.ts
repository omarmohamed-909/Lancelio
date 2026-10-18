import { toInvoice } from './mongo-invoice-store.js';
import type { InvoiceModels } from './invoice-model.js';
import type {
  InvoiceShareStore,
  SharedInvoiceRecord,
} from '../application/ports/invoice-share-store.js';
import type {
  NewInvoiceGrant,
  PublicInvoice,
} from '../domain/invoice-share.js';
import { validateCurrency } from '../../../shared/domain/money.js';
type Stored = Parameters<typeof toInvoice>[0];
function owner(row: Stored): SharedInvoiceRecord {
  return {
    invoice: toInvoice(row),
    grant: row.share
      ? {
          issuedAt: row.share.issuedAt,
          expiresAt: row.share.expiresAt,
          revokedAt: row.share.revokedAt ?? null,
        }
      : null,
  };
}
export class MongoInvoiceShareStore implements InvoiceShareStore {
  constructor(private readonly model: InvoiceModels['Invoice']) {}
  async find(workspaceId: string, id: string) {
    const row = await this.model
      .findOne({ workspace: workspaceId, _id: id })
      .lean();
    return row ? owner(row) : null;
  }
  async issue(
    workspaceId: string,
    id: string,
    version: number,
    grant: NewInvoiceGrant,
  ) {
    const row = await this.model
      .findOneAndUpdate(
        { workspace: workspaceId, _id: id, version, status: 'issued' },
        { $set: { share: grant }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();
    return row ? owner(row) : null;
  }
  async revoke(workspaceId: string, id: string, version: number, now: Date) {
    const row = await this.model
      .findOneAndUpdate(
        {
          workspace: workspaceId,
          _id: id,
          version,
          status: 'issued',
          share: { $ne: null },
          'share.revokedAt': null,
        },
        {
          $set: { 'share.digest': null, 'share.revokedAt': now },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();
    return row ? owner(row) : null;
  }
  async findPublic(digest: string, now: Date): Promise<PublicInvoice | null> {
    const row = await this.model
      .findOne({
        'share.digest': digest,
        'share.revokedAt': null,
        'share.expiresAt': { $gt: now },
        status: 'issued',
        issuedAt: { $type: 'date' },
        senderName: { $type: 'string' },
      })
      .select(
        'number title summary terms currency items totalMinor status client.name client.company senderName issuedAt share.expiresAt -_id',
      )
      .maxTimeMS(3000)
      .lean();
    if (
      !row?.share ||
      row.status !== 'issued' ||
      !row.issuedAt ||
      !row.senderName
    )
      return null;
    return {
      number: row.number,
      title: row.title,
      summary: row.summary,
      terms: row.terms,
      currency: validateCurrency(row.currency),
      items: row.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        totalMinor: item.totalMinor,
      })),
      totalMinor: row.totalMinor,
      status: 'issued',
      client: { name: row.client.name, company: row.client.company },
      senderName: row.senderName,
      issuedAt: row.issuedAt,
      expiresAt: row.share.expiresAt,
    };
  }
}
