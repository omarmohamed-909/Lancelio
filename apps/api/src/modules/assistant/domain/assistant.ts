export const intents = [
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
