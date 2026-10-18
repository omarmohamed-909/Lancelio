import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { ManagePayments } from '../application/manage-payments.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
type Handler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Record<string, string>,
  { identity: { workspace: { id: string } } }
>;
const payment = z.strictObject({
  version: z.number(),
  requestId: z.string(),
  amount: z.string(),
  paidOn: z.string(),
  method: z.string(),
  reference: z.string().optional().default(''),
  memo: z.string().optional().default(''),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid payment request');
  return result.data;
}
export function createPaymentRouter(payments: ManagePayments) {
  const router = Router({ mergeParams: true });
  const read: Handler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    response.json({
      success: true,
      data: await payments.read(
        response.locals.identity.workspace.id,
        request.params.invoiceId ?? '',
      ),
    });
  };
  const add: Handler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    const body = parse(payment, request.body);
    response.status(201).json({
      success: true,
      data: await payments.add(
        response.locals.identity.workspace.id,
        request.params.invoiceId ?? '',
        body.version,
        body,
      ),
    });
  };
  const cancel: Handler = async (request, response) => {
    parse(z.strictObject({}), request.query);
    const body = parse(
      z.strictObject({ version: z.number(), reason: z.string() }),
      request.body,
    );
    response.json({
      success: true,
      data: await payments.void(
        response.locals.identity.workspace.id,
        request.params.invoiceId ?? '',
        request.params.paymentId ?? '',
        body.version,
        body.reason,
      ),
    });
  };
  router.route('/').get(read).post(add);
  router.post('/:paymentId/void', cancel);
  return router;
}
