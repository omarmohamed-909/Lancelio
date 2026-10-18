import { decisionResultSchema } from '../schemas/proposal-decision';
import type { DecisionChoice } from '../schemas/proposal-decision';
import { request } from '../../../shared/api/http-client';
import {
  issuedShareSchema,
  publicProposalSchema,
  shareStateSchema,
} from '../schemas/proposal-share';
export const sharingApi = {
  decide: (token: string, decision: DecisionChoice, requestId: string) =>
    request('/public/proposals/decide', decisionResultSchema, {
      body: { token, decision, requestId },
      credentials: 'omit',
    }),
  read: (token: string, id: string, signal?: AbortSignal) =>
    request('/proposals/' + id + '/share', shareStateSchema, {
      method: 'GET',
      token,
      ...(signal ? { signal } : {}),
    }),
  issue: (token: string, id: string, version: number, days: number) =>
    request('/proposals/' + id + '/share', issuedShareSchema, {
      token,
      body: { version, days },
    }),
  revoke: (token: string, id: string, version: number) =>
    request('/proposals/' + id + '/share/revoke', shareStateSchema, {
      token,
      body: { version },
    }),
  readPublic: (token: string, signal: AbortSignal) =>
    request('/public/proposals/read', publicProposalSchema, {
      body: { token },
      credentials: 'omit',
      signal,
    }),
};
