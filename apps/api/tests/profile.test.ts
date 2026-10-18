import { it, expect, vi } from 'vitest';
import { ManageProfile } from '../src/modules/auth/application/manage-profile.js';
import type { ProfileStore } from '../src/modules/auth/application/ports/profile-store.js';

it('checks active status again if it changes between authentication and the atomic profile write', async () => {
  const store: ProfileStore = {
    findActive: vi.fn().mockResolvedValue(null),
    updateActive: vi.fn().mockResolvedValue(null),
  };
  await expect(
    new ManageProfile(store).update('self', { name: 'Valid name', version: 0 }),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('does not convert infrastructure failure into a successful save or repeat the write', async () => {
  const updateActive = vi
    .fn()
    .mockRejectedValue(new Error('private database failure'));
  const service = new ManageProfile({ findActive: vi.fn(), updateActive });
  await expect(
    service.update('self', { name: 'Valid name', version: 0 }),
  ).rejects.toThrow('private database failure');
  expect(updateActive).toHaveBeenCalledTimes(1);
});
