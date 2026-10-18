import type { ProfileStore } from '../application/ports/profile-store.js';
import type { RegistrationModels } from './registration-models.js';

export class MongoProfileStore implements ProfileStore {
  constructor(private readonly users: RegistrationModels['User']) {}

  async findActive(userId: string) {
    const user = await this.users
      .findOne({ _id: userId, status: 'active' })
      .select('_id name email profileVersion')
      .lean();
    return user
      ? {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          version: user.profileVersion ?? 0,
        }
      : null;
  }

  async updateActive(userId: string, name: string, version: number) {
    const user = await this.users
      .findOneAndUpdate(
        {
          _id: userId,
          status: 'active',
          // Existing accounts without this field start at revision zero.
          ...(version === 0
            ? {
                $or: [
                  { profileVersion: 0 },
                  { profileVersion: { $exists: false } },
                ],
              }
            : { profileVersion: version }),
        },
        { $set: { name }, $inc: { profileVersion: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .select('_id name email profileVersion')
      .lean();
    return user
      ? {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          version: user.profileVersion ?? 0,
        }
      : null;
  }
}
