import { Router } from 'express';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { ShareInvoices } from '../application/share-invoices.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
type OwnerHandler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { workspace: { id: string; name: string } } }
>;
const issueSchema = z.strictObject({ version: z.number(), days: z.number() });
const revokeSchema = z.strictObject({ version: z.number() });
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid sharing request');
  return result.data;
}
export function createInvoiceSharingRouter(sharing: ShareInvoices) {
  const router = Router();
  const read: OwnerHandler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    response.json({
      success: true,
      data: await sharing.read(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
      ),
    });
  };
  const issue: OwnerHandler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    const input = parse(issueSchema, request.body);
    response.status(201).json({
      success: true,
      data: await sharing.issue(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
        input.version,
        input.days,
      ),
    });
  };
  const revoke: OwnerHandler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    const input = parse(revokeSchema, request.body);
    response.json({
      success: true,
      data: await sharing.revoke(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
        input.version,
      ),
    });
  };
  router.route('/:id/share').get(read).post(issue);
  router.post('/:id/share/revoke', revoke);
  return router;
}
export function createPublicInvoiceRouter(sharing: ShareInvoices) {
  const router = Router();
  router.post(
    '/read',
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again later.',
        },
      },
    }),
    async (request, response) => {
      parse(z.strictObject({}), request.query);
      const result = z
        .strictObject({ token: z.string().max(100) })
        .safeParse(request.body as unknown);
      if (!result.success)
        throw new ApplicationError(
          'INVOICE_SHARE_UNAVAILABLE',
          'Sharing link is unavailable',
        );
      response.json({
        success: true,
        data: await sharing.readPublic(result.data.token),
      });
    },
  );
  return router;
}
