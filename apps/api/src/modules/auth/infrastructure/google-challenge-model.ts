import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
const schema = new Schema(
  {
    _id: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { strict: 'throw' },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export function createGoogleChallengeModel(database: Connection) {
  return database.model('GoogleChallenge', schema);
}
export type GoogleChallengeModel = ReturnType<
  typeof createGoogleChallengeModel
>;
