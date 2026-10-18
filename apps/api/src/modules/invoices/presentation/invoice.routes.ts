import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ManageInvoices } from '../application/manage-invoices.js';
type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { workspace: { id: string; name: string } } }
>;
const body = z.strictObject({
  requestId: z.string(),
  clientId: z.string(),
  projectId: z.string().nullable().optional().default(null),
  title: z.string(),
  summary: z.string().optional().default(''),
  terms: z.string().optional().default(''),
  currency: z.string(),
  items: z
    .array(
      z.strictObject({
        title: z.string(),
        quantity: z.number(),
        unitPrice: z.string(),
      }),
    )
    .max(50),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid invoice request');
  return parsed.data;
}
export function createInvoiceRouter(invoices: ManageInvoices) {
  const router = Router();
  const create: Handler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    response.status(201).json({
      success: true,
      data: await invoices.create(
        response.locals.identity.workspace.id,
        parse(body, request.body),
      ),
    });
  };
  const list: Handler = async (request, response) => {
    const query = parse(
      z.strictObject({
        cursor: z.string().optional(),
        order: z.enum(['newest', 'oldest']).optional(),
      }),
      request.query,
    );
    response.json({
      success: true,
      data: await invoices.list(
        response.locals.identity.workspace.id,
        query.cursor,
        query.order,
      ),
    });
  };
  const update: Handler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    const input = parse(
      body.omit({ requestId: true }).extend({ version: z.number() }),
      request.body,
    );
    response.json({
      success: true,
      data: await invoices.update(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
        input.version,
        input,
      ),
    });
  };
  const issue: Handler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    const input = parse(z.strictObject({ version: z.number() }), request.body);
    response.json({
      success: true,
      data: await invoices.issue(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
        input.version,
        response.locals.identity.workspace.name,
      ),
    });
  };
  const read: Handler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    response.json({
      success: true,
      data: await invoices.read(
        response.locals.identity.workspace.id,
        request.params.id ?? '',
      ),
    });
  };
  router.route('/').get(list).post(create);
  router.route('/:id').get(read).put(update);
  router.post('/:id/issue', issue);
  return router;
}
