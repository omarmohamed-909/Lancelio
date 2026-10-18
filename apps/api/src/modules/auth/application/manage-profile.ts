import { ApplicationError } from '../../../shared/domain/application-error.js';
import { unauthenticated } from '../domain/session.js';
import { validateProfileChange } from '../domain/profile.js';
import type { ProfileStore } from './ports/profile-store.js';

export class ManageProfile {
  constructor(private readonly store: ProfileStore) {}

  async read(userId: string) {
    const profile = await this.store.findActive(userId);
    if (!profile) throw unauthenticated();
    return profile;
  }

  async update(userId: string, input: { name: string; version: number }) {
    const change = validateProfileChange(input);
    const profile = await this.store.updateActive(
      userId,
      change.name,
      change.version,
    );
    if (profile) return profile;
    await this.read(userId);
    throw new ApplicationError(
      'PROFILE_CONFLICT',
      'Read the current profile before saving again',
    );
  }
}
