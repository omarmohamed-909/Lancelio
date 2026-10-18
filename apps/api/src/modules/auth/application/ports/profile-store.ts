import type { Profile } from '../../domain/profile.js';

export interface ProfileStore {
  findActive(userId: string): Promise<Profile | null>;
  updateActive(
    userId: string,
    name: string,
    version: number,
  ): Promise<Profile | null>;
}
