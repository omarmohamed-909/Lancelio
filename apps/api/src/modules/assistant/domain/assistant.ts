export const intents = [
  'chat',
  'help',
  'overview',
  'projects',
  'receivables',
  'search',
  'clarify',
] as const;
export const topics = [
  'product',
  'navigation',
  'clients',
  'projects',
  'proposals',
  'invoices',
  'payments',
  'sharing',
  'settings',
] as const;
export const statuses = [
  'open',
  'all',
  'active',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export interface AssistantPlan {
  intent: (typeof intents)[number];
  topic: (typeof topics)[number];
  status: (typeof statuses)[number];
  query: string;
}
export interface AssistantRecord {
  kind: 'clients' | 'projects' | 'proposals' | 'invoices';
  id: string;
  title: string;
  subtitle: string;
  status: string;
  currency: string | null;
  amountMinor: string | null;
}
export interface AssistantFacts {
  clients: number;
  projects: number;
  tasks: number;
  finances: { currency: string; outstandingMinor: string }[];
}
export interface AssistantResult {
  message: string | null;
  plan: AssistantPlan;
  engine: 'guided' | 'openai' | 'gemini';
  degraded: boolean;
  asOf: string | null;
  records: AssistantRecord[];
  hasMore: boolean;
  facts: AssistantFacts | null;
}
export interface AssistantInput {
  message: string;
  history: string[];
  conversation?: { question: string; answer: string }[];
  locale?: 'ar' | 'en' | undefined;
}

export interface AssistantConversationInput {
  question: string;
  previousQuestions: string[];
  conversation: { question: string; answer: string }[];
  firstName: string;
  locale: 'ar' | 'en';
  plan: AssistantPlan;
}

export type AssistantTurnInput = Omit<AssistantConversationInput, 'plan'>;
export interface AssistantTurn {
  plan: AssistantPlan;
  message: string | null;
}

export function isAssistantTurn(value: unknown): value is AssistantTurn {
  if (!value || typeof value !== 'object') return false;
  const turn = value as Record<string, unknown>;
  if (Object.keys(turn).length !== 2 || !isAssistantPlan(turn.plan))
    return false;
  return ['chat', 'help', 'clarify'].includes(turn.plan.intent)
    ? isAssistantMessage(turn.message)
    : turn.message === null;
}

export function isAssistantMessage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 4000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
  );
}

export function isAssistantPlan(value: unknown): value is AssistantPlan {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).length === 4 &&
    intents.some((x) => x === v.intent) &&
    topics.some((x) => x === v.topic) &&
    statuses.some((x) => x === v.status) &&
    typeof v.query === 'string' &&
    v.query.length <= 100 &&
    !/[\u0000-\u001f]/u.test(v.query) &&
    (v.intent !== 'search' || v.query.trim().length >= 2)
  );
}
