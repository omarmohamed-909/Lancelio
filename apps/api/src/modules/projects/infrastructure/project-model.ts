import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const client = new Schema(
  {
    id: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    company: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  { _id: false },
);
const item = new Schema(
  {
    title: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPriceMinor: { type: Number, required: true },
    totalMinor: { type: Number, required: true },
  },
  { _id: false },
);
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    sourceProposal: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    terms: { type: String, default: '' },
    currency: {
      type: String,
      enum: ['EGP', 'USD', 'EUR', 'SAR', null],
      default: null,
    },
    items: { type: [item], required: true },
    totalMinor: { type: Number, default: null },
    client: { type: client, required: true },
    acceptedAt: { type: Date, default: null },
    taskReferenceRevision: { type: Number, default: 0 },
    version: { type: Number, default: 1, min: 1, required: true },
    status: {
      type: String,
      enum: ['active', 'on_hold', 'completed', 'cancelled'],
      default: 'active',
      required: true,
    },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
);
schema.index(
  { workspace: 1, sourceProposal: 1 },
  {
    unique: true,
    name: 'project_proposal_source',
    partialFilterExpression: { sourceProposal: { $type: 'objectId' } },
  },
);
schema.index({ workspace: 1, status: 1, _id: -1 });
schema.index({ workspace: 1, _id: -1 });
export function createProjectModel(connection: Connection) {
  return connection.model('Project', schema);
}
export type ProjectModel = ReturnType<typeof createProjectModel>;

export async function initializeProjectModel(model: ProjectModel) {
  await model.createCollection();
  // Install the replacement first so source uniqueness is protected throughout migration.
  await model.createIndexes();
  const indexes = await model.collection.indexes();
  const legacy = indexes.find(
    (index) =>
      index.name === 'workspace_1_sourceProposal_1' &&
      index.unique === true &&
      index.key.workspace === 1 &&
      index.key.sourceProposal === 1 &&
      Object.keys(index.key).length === 2 &&
      !index.partialFilterExpression,
  );
  if (legacy?.name) {
    try {
      await model.collection.dropIndex(legacy.name);
    } catch (cause: unknown) {
      // Another process may have removed this same legacy index after our read.
      if (!(cause instanceof Error && 'code' in cause && cause.code === 27))
        throw cause;
    }
  }
}
