import type { Currency } from '../../../shared/domain/money.js';
import type { PublicGrant } from '../../../shared/domain/public-grant.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
export interface PortalOwnerRecord {
  client: { id: string; name: string; company: string; archived: boolean };
  version: number;
  share: PublicGrant | null;
}
export interface PortalOwnerState extends Omit<PortalOwnerRecord, 'share'> {
  share: (PublicGrant & { state: 'active' | 'expired' | 'revoked' }) | null;
}
export interface PortalPage {
  client: { name: string; company: string };
  workspaceName: string;
  asOf: Date;
  projects: {
    title: string;
    summary: string;
    status: 'active' | 'on_hold' | 'completed' | 'cancelled';
    progress: { total: number; done: number; percentage: number | null };
    tasks: {
      title: string;
      description: string;
      status: 'todo' | 'in_progress' | 'done';
    }[];
  }[];
  invoices: {
    number: string;
    title: string;
    currency: Currency;
    totalMinor: number;
    paidMinor: number;
    remainingMinor: number;
    paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
    issuedAt: Date;
  }[];
  nextProjectCursor: string | null;
  nextInvoiceCursor: string | null;
}
export interface PortalCursors {
  projects: string | null;
  invoices: string | null;
}
export function validatePortalVersion(version: number) {
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version >= Number.MAX_SAFE_INTEGER
  )
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid portal revision');
}
export function visibleProgress(tasks: readonly { status: string }[]) {
  const total = tasks.length,
    done = tasks.filter((task) => task.status === 'done').length;
  return {
    total,
    done,
    percentage:
      total === 0
        ? null
        : done === total
          ? 100
          : Math.min(99, Math.round((done * 100) / total)),
  };
}
