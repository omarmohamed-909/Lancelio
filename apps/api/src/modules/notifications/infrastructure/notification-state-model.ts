import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const schema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, required: true, immutable: true },
    user: { type: Schema.Types.ObjectId, required: true, immutable: true },
    eventId: { type: String, required: true, immutable: true },
    read: { type: Boolean, required: true },
    readAt: { type: Date, default: null },
    version: { type: Number, required: true },
  },
  { versionKey: false, strict: 'throw' },
);
schema.index({ workspace: 1, user: 1, eventId: 1 }, { unique: true });
export function createNotificationStateModel(connection: Connection) {
  return connection.model('NotificationState', schema);
}
export type NotificationStateModel = ReturnType<
  typeof createNotificationStateModel
>;
