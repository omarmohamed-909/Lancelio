import type { ClientSession, InferSchemaType } from 'mongoose';
import type { ProjectStore } from '../application/ports/project-store.js';
import type {
  AcceptedProjectInput,
  ManualProjectInput,
  Project,
  ProjectClient,
  ProjectListQuery,
  ProjectStatus,
  ProjectSummary,
} from '../domain/project.js';
import { validateProjectStatus } from '../domain/project.js';
import type { ProjectModel } from './project-model.js';
import { validateCurrency } from '../../../shared/domain/money.js';
type Stored = InferSchemaType<ProjectModel['schema']> & {
  _id: { toString(): string };
};
function summary(record: Stored): ProjectSummary {
  return {
    id: record._id.toString(),
    origin: record.sourceProposal ? 'proposal' : 'manual',
    sourceProposalId: record.sourceProposal?.toString() ?? null,
    title: record.title,
    client: {
      id: record.client.id.toString(),
      name: record.client.name,
      company: record.client.company,
      email: record.client.email,
      phone: record.client.phone,
    },
    status: validateProjectStatus(record.status),
    version: record.version ?? 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
function dto(record: Stored): Project {
  return {
    ...summary(record),
    summary: record.summary,
    terms: record.terms,
    currency: record.currency ? validateCurrency(record.currency) : null,
    items: record.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      totalMinor: item.totalMinor,
    })),
    totalMinor: record.totalMinor ?? null,
    acceptedAt: record.acceptedAt ?? null,
  };
}
export class MongoProjectStore implements ProjectStore {
  constructor(
    private readonly model: ProjectModel,
    private readonly session?: ClientSession,
  ) {}
  async createAccepted(input: AcceptedProjectInput) {
    const { workspaceId, sourceProposalId, ...content } = input;
    const [record] = await this.model.create(
      [
        {
          workspace: workspaceId,
          sourceProposal: sourceProposalId,
          ...content,
        },
      ],
      this.session ? { session: this.session } : {},
    );
    if (!record) throw new Error('Project was not created');
    return dto(record);
  }
  async createManual(
    workspaceId: string,
    input: ManualProjectInput,
    client: ProjectClient,
  ) {
    const [record] = await this.model.create(
      [
        {
          workspace: workspaceId,
          title: input.title,
          summary: input.summary,
          client,
          items: [],
        },
      ],
      this.session ? { session: this.session } : {},
    );
    if (!record) throw new Error('Project was not created');
    return dto(record);
  }
  async find(workspaceId: string, id: string) {
    const record = await this.model
      .findOne({ workspace: workspaceId, _id: id })
      .session(this.session ?? null)
      .lean();
    return record ? dto(record) : null;
  }
  async list(workspaceId: string, query: ProjectListQuery) {
    const records = await this.model
      .find({
        workspace: workspaceId,
        ...(query.status === 'all' ? {} : { status: query.status }),
        ...(query.cursor
          ? {
              _id:
                query.order === 'oldest'
                  ? { $gt: query.cursor }
                  : { $lt: query.cursor },
            }
          : {}),
      })
      .select(
        '_id sourceProposal title client status version createdAt updatedAt',
      )
      .sort({ _id: query.order === 'oldest' ? 1 : -1 })
      .limit(26)
      .maxTimeMS(3000)
      .lean();
    const items = records.slice(0, 25).map(summary);
    return {
      items,
      nextCursor: records.length > 25 ? (items.at(-1)?.id ?? null) : null,
    };
  }
  async changeStatus(
    workspaceId: string,
    id: string,
    version: number,
    current: ProjectStatus,
    next: ProjectStatus,
  ) {
    const record = await this.model
      .findOneAndUpdate(
        {
          workspace: workspaceId,
          _id: id,
          status: current,
          ...(version === 1
            ? { $or: [{ version: 1 }, { version: { $exists: false } }] }
            : { version }),
        },
        { $set: { status: next, version: version + 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();
    return record ? dto(record) : null;
  }
}
