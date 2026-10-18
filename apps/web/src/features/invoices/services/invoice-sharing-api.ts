import { request } from '../../../shared/api/http-client';
import {
  invoiceShareStateSchema,
  newInvoiceShareSchema,
  publicInvoiceSchema,
} from '../schemas/invoice-share';
export const invoiceSharingApi = {
  read: (token: string, id: string, signal: AbortSignal) =>
    request('/invoices/' + id + '/share', invoiceShareStateSchema, {
      token,
      method: 'GET',
      signal,
    }),
  issue: (
    token: string,
    id: string,
    version: number,
    days: number,
    signal: AbortSignal,
  ) =>
    request('/invoices/' + id + '/share', newInvoiceShareSchema, {
      token,
      body: { version, days },
      signal,
    }),
  revoke: (token: string, id: string, version: number, signal: AbortSignal) =>
    request('/invoices/' + id + '/share/revoke', invoiceShareStateSchema, {
      token,
      body: { version },
      signal,
    }),
  readPublic: (token: string, signal: AbortSignal) =>
    request('/public/invoices/read', publicInvoiceSchema, {
      body: { token },
      credentials: 'omit',
      signal,
    }),
};
