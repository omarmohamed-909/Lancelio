import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const task = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    priority: { type: String, enum: ['low', 'normal', 'high'], required: true },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'done'],
      required: true,
    },
    clientVisible: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    project: { type: Schema.Types.ObjectId, required: true, immutable: true },
    version: { type: Number, required: true, min: 1 },
    tasks: { type: [task], required: true },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
);
schema.index({ workspace: 1, project: 1 }, { unique: true });
export function createTaskBoardModel(connection: Connection) {
  return connection.model('TaskBoard', schema);
}
export type TaskBoardModel = ReturnType<typeof createTaskBoardModel>;
