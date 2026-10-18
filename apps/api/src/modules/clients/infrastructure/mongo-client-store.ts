import type { ClientListQuery } from '../domain/client-list.js';
import type { InferSchemaType } from 'mongoose';
import type { ClientStore } from '../application/ports/client-store.js';
import type { Client, ClientDetails } from '../domain/client.js';
import type { ClientModel } from './client-model.js';
type StoredClient = InferSchemaType<ClientModel['schema']> & {
  _id: { toString(): string };
};
function toClient(record: StoredClient): Client {
  return {
    id: record._id.toString(),
    name: record.name,
    email: record.email,
    phone: record.phone,
    company: record.company,
    notes: record.notes,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt ?? null,
  };
}
export class MongoClientStore implements ClientStore {
  constructor(private readonly model: ClientModel) {}
  async create(workspaceId: string, details: ClientDetails) {
    return toClient(
      await this.model.create({ workspace: workspaceId, ...details }),
    );
  }
  async find(workspaceId: string, id: string) {
    const record = await this.model
      .findOne({ workspace: workspaceId, _id: id })
      .lean();
    return record ? toClient(record) : null;
  }
  async list(workspaceId: string, query: ClientListQuery) {
    const pattern = escapeSearch(query.search);
    const contact =
      query.contact === 'email'
        ? { email: { $ne: '' } }
        : query.contact === 'phone'
          ? { phone: { $ne: '' } }
          : query.contact === 'none'
            ? { email: '', phone: '' }
            : {};

    const records = await this.model
      .find({
        workspace: workspaceId,
        archivedAt: query.archived ? { $ne: null } : null,
        ...contact,
        ...(query.search
          ? {
              $or: [
                { name: { $regex: pattern, $options: 'i' } },
                { company: { $regex: pattern, $options: 'i' } },
                { email: { $regex: pattern, $options: 'i' } },
              ],
            }
          : {}),
        ...(query.cursor
          ? {
              _id:
                query.order === 'oldest'
                  ? { $gt: query.cursor }
                  : { $lt: query.cursor },
            }
          : {}),
      })
      .sort({ _id: query.order === 'oldest' ? 1 : -1 })
      .limit(26)
      .maxTimeMS(3000)
      .lean();
    const items = records.slice(0, 25).map(toClient);
    return {
      items,
      nextCursor: records.length > 25 ? (items.at(-1)?.id ?? null) : null,
    };
  }
  async update(
    workspaceId: string,
    id: string,
    version: number,
    details: ClientDetails,
  ) {
    const record = await this.model
      .findOneAndUpdate(
        { workspace: workspaceId, _id: id, version, archivedAt: null },
        { $set: details, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();
    return record ? toClient(record) : null;
  }
  async archive(workspaceId: string, id: string, version: number) {
    const record = await this.model
      .findOneAndUpdate(
        { workspace: workspaceId, _id: id, version, archivedAt: null },
        { $set: { archivedAt: new Date() }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();
    return record ? toClient(record) : null;
  }
}

function escapeSearch(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
