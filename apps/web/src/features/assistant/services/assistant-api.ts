import { z } from 'zod';
import { request } from '../../../shared/api/http-client';

const plan = z.object({
  intent: z.enum([
    'chat',
    'help',
    'overview',
    'projects',
    'receivables',
    'search',
    'clarify',
  ]),
  topic: z.enum([
    'product',
    'navigation',
    'clients',
    'projects',
    'proposals',
    'invoices',
    'payments',
    'sharing',
    'settings',
  ]),
  status: z.enum([
    'open',
    'all',
    'active',
    'on_hold',
    'completed',
    'cancelled',
  ]),
  query: z.string().max(100),
});
const currency = z.enum(['EGP', 'USD', 'EUR', 'SAR']);
const minor = z.string().regex(/^\d+$/u).max(40);
const reply = z.object({
  message: z.string().min(1).max(4000).nullable().default(null),
  plan,
  engine: z.enum(['guided', 'openai', 'gemini']),
  degraded: z.boolean(),
  asOf: z.iso.datetime().nullable(),
  records: z
    .array(
      z.object({
        kind: z.enum(['clients', 'projects', 'proposals', 'invoices']),
        id: z.string().regex(/^[a-f\d]{24}$/u),
        title: z.string(),
        subtitle: z.string(),
        status: z.string(),
        currency: currency.nullable(),
        amountMinor: minor.nullable(),
      }),
    )
    .max(20),
  hasMore: z.boolean(),
  facts: z
    .object({
      clients: z.number().int().nonnegative(),
      projects: z.number().int().nonnegative(),
      tasks: z.number().int().nonnegative(),
      finances: z.array(z.object({ currency, outstandingMinor: minor })).max(4),
    })
    .nullable(),
});
export type AssistantReply = z.infer<typeof reply>;
export type AssistantTopic = AssistantReply['plan']['topic'];
export const assistantApi = {
  mode: (token: string, signal: AbortSignal) =>
    request(
      '/assistant',
      z.object({ mode: z.enum(['guided', 'openai', 'gemini']) }),
      {
        method: 'GET',
        token,
        signal,
      },
    ),
  ask: (
    token: string,
    message: string,
    history: string[],
    signal: AbortSignal,
    conversation: { question: string; answer: string }[] = [],
    locale?: 'ar' | 'en',
  ) =>
    request('/assistant', reply, {
      token,
      signal,
      body: { message, history, conversation, locale },
    }),
};
