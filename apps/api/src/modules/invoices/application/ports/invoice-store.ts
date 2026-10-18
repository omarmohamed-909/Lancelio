import type { ListOrder } from '../../../../shared/domain/list-order.js';
import type {
  Invoice,
  InvoicePage,
  InvoiceContent,
  InvoiceClient,
  InvoiceProject,
} from '../../domain/invoice.js';
export interface InvoiceStore {
  find(workspaceId: string, id: string): Promise<Invoice | null>;
  findRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<{ invoice: Invoice; fingerprint: string | null } | null>;
  preserveCreation(
    workspaceId: string,
    id: string,
    fingerprint: string,
  ): Promise<void>;
  updateDraft(
    workspaceId: string,
    id: string,
    version: number,
    content: InvoiceContent,
    client: InvoiceClient,
    project: InvoiceProject | null,
  ): Promise<Invoice | null>;
  issue(
    workspaceId: string,
    id: string,
    version: number,
    client: InvoiceClient,
    senderName: string,
    now: Date,
  ): Promise<Invoice | null>;
  list(
    workspaceId: string,
    cursor?: string,
    order?: ListOrder,
  ): Promise<InvoicePage>;
  create(
    workspaceId: string,
    requestId: string,
    fingerprint: string,
    sequence: number,
    content: InvoiceContent,
    client: InvoiceClient,
    project: InvoiceProject | null,
  ): Promise<Invoice>;
}
export interface InvoiceReferences {
  reserveClient(
    workspaceId: string,
    clientId: string,
    allowArchived?: boolean,
  ): Promise<InvoiceClient | null>;
  findProject(
    workspaceId: string,
    projectId: string,
  ): Promise<InvoiceProject | null>;
}
export interface InvoiceContext {
  invoices: InvoiceStore;
  references: InvoiceReferences;
  nextNumber(): Promise<number>;
}
export interface InvoiceTransactions {
  execute<T>(
    workspaceId: string,
    action: (context: InvoiceContext) => Promise<T>,
  ): Promise<T>;
}

export interface InvoiceDigest {
  digest(content: string): string;
}
