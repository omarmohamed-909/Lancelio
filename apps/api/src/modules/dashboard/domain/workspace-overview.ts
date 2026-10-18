import type { Currency } from '../../../shared/domain/money.js';
export interface WorkspaceOverview {
  asOf: string;
  clients: { active: number; archived: number };
  proposals: {
    draft: number;
    sent: number;
    accepted: number;
    rejected: number;
    expired: number;
  };
  projects: {
    active: number;
    on_hold: number;
    completed: number;
    cancelled: number;
  };
  tasks: { todo: number; in_progress: number; done: number };
  invoices: { draft: number; issued: number };
  finances: {
    currency: Currency;
    invoicedMinor: string;
    receivedMinor: string;
    outstandingMinor: string;
  }[];
  expiringProposals: { id: string; title: string; expiresAt: string }[];
}
