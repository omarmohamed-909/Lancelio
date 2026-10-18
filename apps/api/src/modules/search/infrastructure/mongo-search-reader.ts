import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import type { SearchReader } from '../application/ports/search-reader.js';
import type { SearchGroup, SearchKind } from '../domain/search-results.js';

export type SearchCollections = Record<SearchKind, string>;
interface SearchDocument {
  _id: Types.ObjectId;
  name?: string;
  title?: string;
  company?: string;
  number?: string;
  client?: { name: string };
  archivedAt?: Date | null;
}

export class MongoSearchReader implements SearchReader {
  constructor(
    private readonly database: Connection,
    private readonly collections: SearchCollections,
  ) {}
  async read(workspaceId: string, query: string): Promise<SearchGroup[]> {
    const literal = query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const regex = new RegExp(literal, 'i');
    return Promise.all(
      (['clients', 'projects', 'proposals', 'invoices'] as const).map(
        async (kind) => {
          const fields =
            kind === 'clients'
              ? ['name', 'company']
              : kind === 'invoices'
                ? ['title', 'client.name', 'number']
                : ['title', 'client.name'];
          const documents = await this.database
            .collection<SearchDocument>(this.collections[kind])
            .find(
              {
                workspace: new Types.ObjectId(workspaceId),
                $or: fields.map((field) => ({ [field]: regex })),
              },
              {
                projection: {
                  _id: 1,
                  name: 1,
                  title: 1,
                  company: 1,
                  number: 1,
                  'client.name': 1,
                  archivedAt: 1,
                },
                maxTimeMS: 2000,
              },
            )
            .sort({ _id: -1 })
            .limit(6)
            .toArray();
          return {
            kind,
            items: documents.slice(0, 5).map((document) => ({
              id: document._id.toHexString(),
              title: document.title ?? document.name ?? '',
              subtitle:
                document.number ??
                document.client?.name ??
                document.company ??
                '',
              archived: kind === 'clients' && document.archivedAt != null,
            })),
            hasMore: documents.length > 5,
          };
        },
      ),
    );
  }
}
