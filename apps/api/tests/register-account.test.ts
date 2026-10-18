import { describe, expect, it, vi } from 'vitest';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import type { AccountSummary } from '../src/modules/auth/domain/registration.js';
import { ApplicationError } from '../src/shared/domain/application-error.js';

const summary: AccountSummary = {
  user: { id: 'user-1', name: 'Ahmed', email: 'ahmed@example.com' },
  workspace: { id: 'workspace-1', name: 'Studio', slug: 'workspace-1' },
  membership: { id: 'membership-1', role: 'owner' },
};
const input = {
  name: ' Ahmed ',
  email: ' AHMED@Example.COM ',
  password: 'a secure password for tests',
  workspaceName: ' Studio ',
};

function setup() {
  const createOwnerAccount = vi.fn().mockResolvedValue(summary);
  const hash = vi.fn().mockResolvedValue('hashed-secret');
  const useCase = new RegisterAccount({ createOwnerAccount }, { hash });
  return { useCase, createOwnerAccount, hash };
}

describe('RegisterAccount', () => {
  it('normalizes identity and passes only the password hash to persistence', async () => {
    const { useCase, createOwnerAccount, hash } = setup();
    expect(await useCase.execute(input)).toEqual(summary);
    expect(hash).toHaveBeenCalledWith(input.password);
    expect(createOwnerAccount).toHaveBeenCalledWith({
      name: 'Ahmed',
      email: 'ahmed@example.com',
      workspaceName: 'Studio',
      passwordHash: 'hashed-secret',
    });
  });

  it('uses the account name when no workspace name is provided', async () => {
    const { useCase, createOwnerAccount } = setup();
    await useCase.execute({
      name: input.name,
      email: input.email,
      password: input.password,
    });
    expect(createOwnerAccount.mock.calls[0]?.[0].workspaceName).toBe('Ahmed');
  });

  it.each([
    { name: ' ' },
    { name: 'x'.repeat(101) },
    { email: 'not-an-email' },
    { email: 'name@example..com' },
    { email: '.name@example.com' },
    { password: 'short' },
    { password: 'x'.repeat(129) },
    { workspaceName: ' ' },
  ])(
    'rejects invalid input before hashing or persistence: %j',
    async (override) => {
      const { useCase, hash, createOwnerAccount } = setup();
      await expect(
        useCase.execute({ ...input, ...override }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(hash).not.toHaveBeenCalled();
      expect(createOwnerAccount).not.toHaveBeenCalled();
    },
  );

  it('does not trim or truncate passwords, including Unicode', async () => {
    const { useCase, hash } = setup();
    const password = `  ${'🔐'.repeat(15)}  `;
    await useCase.execute({ ...input, password });
    expect(hash).toHaveBeenCalledWith(password);
  });

  it('propagates a safe duplicate email error', async () => {
    const { useCase, createOwnerAccount } = setup();
    createOwnerAccount.mockRejectedValue(
      new ApplicationError(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists',
      ),
    );
    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
    });
  });

  it('does not persist when password hashing fails', async () => {
    const { useCase, hash, createOwnerAccount } = setup();
    hash.mockRejectedValue(new Error('Hashing unavailable'));
    await expect(useCase.execute(input)).rejects.toThrow('Hashing unavailable');
    expect(createOwnerAccount).not.toHaveBeenCalled();
  });
});
