import type { RequestHandler } from 'express';
import type { AuthenticateSession } from '../application/authenticate-session.js';
import { unauthenticated } from '../domain/session.js';
import type { AuthenticatedIdentity } from '../domain/session.js';

export type AuthenticatedLocals = { identity: AuthenticatedIdentity };
export type AuthenticatedHandler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  AuthenticatedLocals
>;

export function createAuthenticationMiddleware(
  authenticate: AuthenticateSession,
): AuthenticatedHandler {
  return async (request, response, next) => {
    const authorization = request.get('authorization');
    const match =
      authorization?.length && authorization.length <= 4096
        ? /^Bearer ([^\s]+)$/iu.exec(authorization)
        : null;
    const token = match?.[1];
    if (!token) throw unauthenticated();
    response.locals.identity = await authenticate.execute(token);
    next();
  };
}
