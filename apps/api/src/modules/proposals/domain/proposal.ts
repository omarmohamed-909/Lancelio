import type { ProposalDecision } from './proposal-decision.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
import { validateCurrency } from '../../../shared/domain/money.js';
import { priceItems } from '../../../shared/domain/priced-items.js';
import type {
  PriceInput,
  PricedItem,
} from '../../../shared/domain/priced-items.js';
export type { PricedItem } from '../../../shared/domain/priced-items.js';
import type { Currency } from '../../../shared/domain/money.js';
export type ProposalStatus =
  'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type ProposalItemInput = PriceInput;
export interface DraftInput {
  clientId: string;
  title: string;
  summary: string;
  terms: string;
  currency: string;
  items: ProposalItemInput[];
}

export interface DraftContent {
  clientId: string;
  title: string;
  summary: string;
  terms: string;
  currency: Currency;
  items: PricedItem[];
  totalMinor: number;
  itemCount: number;
}
export interface ProposalClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
}
export interface ProposalSummary {
  id: string;
  title: string;
  client: ProposalClient;
  status: ProposalStatus;
  currency: Currency;
  totalMinor: number;
  itemCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface Proposal extends ProposalSummary {
  decision: ProposalDecision | null;
  projectId: string | null;
  summary: string;
  terms: string;
  items: PricedItem[];
}
export interface ProposalPage {
  items: ProposalSummary[];
  nextCursor: string | null;
}
export function validateDraft(input: DraftInput): DraftContent {
  const clientId = validateId(input.clientId);
  const title = input.title.trim();
  const summary = input.summary.trim();
  const terms = input.terms.trim();
  const fields: Record<string, string> = {};
  if (Array.from(title).length < 2 || Array.from(title).length > 120)
    fields.title = 'Title must contain 2–120 characters';
  if (Array.from(summary).length > 3000)
    fields.summary = 'Summary must not exceed 3000 characters';
  if (Array.from(terms).length > 2000)
    fields.terms = 'Terms must not exceed 2000 characters';
  if (input.items.length < 1 || input.items.length > 50)
    fields.items = 'Include 1–50 deliverables';
  if (Object.keys(fields).length)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Invalid proposal details',
      fields,
    );
  const currency = validateCurrency(input.currency);
  const priced = priceItems(input.items, currency, {
    invalidItem: 'Invalid deliverable',
    overflow: 'Proposal total exceeds the supported limit',
  });
  return {
    clientId,
    title,
    summary,
    terms,
    currency,
    ...priced,
  };
}
