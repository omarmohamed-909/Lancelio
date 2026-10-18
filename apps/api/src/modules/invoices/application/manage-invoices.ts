import { validateListOrder } from '../../../shared/domain/list-order.js';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import {
  validateId,
  validateVersion,
} from '../../../shared/domain/identifiers.js';
import {
  creationIdentity,
  invoiceContent,
  sameInvoiceContent,
  validateInvoice,
  validateInvoiceContent,
} from '../domain/invoice.js';
import type { InvoiceInput, Invoice } from '../domain/invoice.js';
import type {
  InvoiceStore,
  InvoiceTransactions,
  InvoiceDigest,
} from './ports/invoice-store.js';
export class ManageInvoices {
  constructor(
    private readonly store: InvoiceStore,
    private readonly transactions: InvoiceTransactions,
    private readonly keys: InvoiceDigest,
    private readonly now: () => Date = () => new Date(),
  ) {}
  create(scope: string, input: InvoiceInput) {
    const workspaceId = validateId(scope),
      content = validateInvoice(input),
      requestId = input.requestId.toLowerCase(),
      fingerprint = this.keys.digest(creationIdentity(content));
    return this.transactions.execute(workspaceId, async (context) => {
      const existing = await context.invoices.findRequest(
        workspaceId,
        requestId,
      );
      if (existing) {
        if (
          existing.fingerprint
            ? existing.fingerprint !== fingerprint
            : !sameInvoiceContent(existing.invoice, content)
        )
          throw new ApplicationError(
            'INVOICE_REQUEST_CONFLICT',
            'Request id already used for other invoice content',
          );
        return existing.invoice;
      }
      const client = await context.references.reserveClient(
        workspaceId,
        content.clientId,
      );
      if (!client)
        throw new ApplicationError(
          'INVOICE_CLIENT_UNAVAILABLE',
          'Choose an active client in this workspace',
        );
      const project = content.projectId
        ? await context.references.findProject(workspaceId, content.projectId)
        : null;
      if (content.projectId && (!project || project.clientId !== client.id))
        throw new ApplicationError(
          'INVOICE_PROJECT_UNAVAILABLE',
          'Project must belong to the selected client and workspace',
        );
      const sequence = await context.nextNumber();
      return context.invoices.create(
        workspaceId,
        requestId,
        fingerprint,
        sequence,
        content,
        client,
        project,
      );
    });
  }
  list(scope: string, cursor?: string, order?: string) {
    return this.store.list(
      validateId(scope),
      cursor === undefined ? undefined : validateId(cursor),
      validateListOrder(order),
    );
  }
  async read(scope: string, id: string) {
    const result = await this.store.find(validateId(scope), validateId(id));
    if (!result)
      throw new ApplicationError('INVOICE_NOT_FOUND', 'Invoice not found');
    return result;
  }
  private editable(
    invoice: Invoice | null,
    version: number,
  ): asserts invoice is Invoice {
    if (!invoice)
      throw new ApplicationError('INVOICE_NOT_FOUND', 'Invoice not found');
    if (invoice.status !== 'draft')
      throw new ApplicationError(
        'INVOICE_LOCKED',
        'Issued invoice content is immutable',
      );
    if (invoice.version !== version)
      throw new ApplicationError(
        'INVOICE_CONFLICT',
        'Invoice changed; reload current version',
      );
  }
  update(
    scope: string,
    id: string,
    version: number,
    input: Omit<InvoiceInput, 'requestId'>,
  ) {
    const workspaceId = validateId(scope),
      invoiceId = validateId(id);
    validateVersion(version);
    const content = validateInvoiceContent(input);
    return this.transactions.execute(workspaceId, async (context) => {
      const current = await context.invoices.find(workspaceId, invoiceId);
      this.editable(current, version);
      await context.invoices.preserveCreation(
        workspaceId,
        invoiceId,
        this.keys.digest(creationIdentity(invoiceContent(current))),
      );
      const client = await context.references.reserveClient(
        workspaceId,
        content.clientId,
        current.client.id === content.clientId,
      );
      if (!client)
        throw new ApplicationError(
          'INVOICE_CLIENT_UNAVAILABLE',
          'Client unavailable',
        );
      const project = content.projectId
        ? await context.references.findProject(workspaceId, content.projectId)
        : null;
      if (content.projectId && (!project || project.clientId !== client.id))
        throw new ApplicationError(
          'INVOICE_PROJECT_UNAVAILABLE',
          'Project must match this client and workspace',
        );
      const saved = await context.invoices.updateDraft(
        workspaceId,
        invoiceId,
        version,
        content,
        client,
        project,
      );
      if (!saved)
        throw new ApplicationError('INVOICE_CONFLICT', 'Invoice changed');
      return saved;
    });
  }
  issue(scope: string, id: string, version: number, senderName: string) {
    const workspaceId = validateId(scope),
      invoiceId = validateId(id);
    validateVersion(version);
    return this.transactions.execute(workspaceId, async (context) => {
      const current = await context.invoices.find(workspaceId, invoiceId);
      this.editable(current, version);
      await context.invoices.preserveCreation(
        workspaceId,
        invoiceId,
        this.keys.digest(creationIdentity(invoiceContent(current))),
      );
      const client = await context.references.reserveClient(
        workspaceId,
        current.client.id,
        true,
      );
      if (!client)
        throw new ApplicationError(
          'INVOICE_CLIENT_UNAVAILABLE',
          'Invoice client unavailable',
        );
      const saved = await context.invoices.issue(
        workspaceId,
        invoiceId,
        version,
        client,
        senderName,
        this.now(),
      );
      if (!saved)
        throw new ApplicationError('INVOICE_CONFLICT', 'Invoice changed');
      return saved;
    });
  }
}
