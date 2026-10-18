import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { DecideProposal } from '../application/decide-proposal.js';
export function createProposalDecisionRouter(
  decisions: DecideProposal,
  webOrigin: string,
) {
  const router = Router();
  router.post(
    '/decide',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many decisions. Try again later.',
        },
      },
    }),
    async (request, response) => {
      if (request.get('origin') !== webOrigin)
        throw new ApplicationError(
          'UNTRUSTED_ORIGIN',
          'Request origin is not allowed',
        );
      const input = z
        .strictObject({
          token: z.string().max(100),
          decision: z.enum(['accept', 'reject']),
          requestId: z.string().max(36),
        })
        .safeParse(request.body as unknown);
      if (!input.success)
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Invalid proposal decision',
        );
      response.json({
        success: true,
        data: await decisions.execute(
          input.data.token,
          input.data.decision,
          input.data.requestId,
        ),
      });
    },
  );
  return router;
}
