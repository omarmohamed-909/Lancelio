import { ApplicationError } from '../../../shared/domain/application-error.js';

export const sessionPolicy = {
  accessLifetimeSeconds: 15 * 60,
  refreshLifetimeSeconds: 7 * 24 * 60 * 60,
} as const;

export interface AuthenticatedIdentity {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
  readonly workspace: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly membership: {
    readonly id: string;
    readonly role: 'owner' | 'admin' | 'member';
  };
}

export interface SessionClaims {
  readonly userId: string;
  readonly workspaceId: string;
  readonly sessionId: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly workspaceId?: string;
}

export function validateLogin(input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const passwordLength = Array.from(input.password).length;
  if (
    !email ||
    email.length > 254 ||
    passwordLength < 1 ||
    passwordLength > 128 ||
    (input.workspaceId !== undefined &&
      !/^[a-f0-9]{24}$/iu.test(input.workspaceId))
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid login data');
  }
  return {
    email,
    password: input.password,
    ...(input.workspaceId !== undefined
      ? { workspaceId: input.workspaceId.toLowerCase() }
      : {}),
  };
}

export function unauthenticated() {
  return new ApplicationError('UNAUTHENTICATED', 'Authentication is required');
}
