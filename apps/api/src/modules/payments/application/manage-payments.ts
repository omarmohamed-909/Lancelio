import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
import {
  ledgerView,
  paymentLimit,
  samePayment,
  validateLedgerVersion,
  validatePayment,
  validateVoidReason,
} from '../domain/payment-ledger.js';
import type {
  PaymentInput,
  PaymentContent,
  StoredLedger,
} from '../domain/payment-ledger.js';
import type {
  PaymentStore,
  PaymentInvoiceDirectory,
} from './ports/payment-store.js';
export class ManagePayments {
  constructor(
    private readonly store: PaymentStore,
    private readonly invoices: PaymentInvoiceDirectory,
    private readonly newId: () => string,
    private readonly now: () => Date,
  ) {}
  private async invoice(scope: string, id: string) {
    const invoice = await this.invoices.find(scope, id);
    if (!invoice)
      throw new ApplicationError(
        'PAYMENT_INVOICE_NOT_FOUND',
        'Invoice not found',
      );
    return invoice;
  }
  async read(workspaceId: string, invoiceId: string) {
    const scope = validateId(workspaceId),
      id = validateId(invoiceId),
      invoice = await this.invoice(scope, id);
    return ledgerView(id, invoice, await this.store.find(scope, id));
  }
  private replay(
    ledger: StoredLedger | null,
    requestId: string,
    content: PaymentContent,
  ) {
    const existing = ledger?.entries.find(
      (entry) => entry.requestId === requestId,
    );
    if (!existing) return false;
    if (!samePayment(existing, content))
      throw new ApplicationError(
        'PAYMENT_REQUEST_CONFLICT',
        'Payment request id was used for other content',
      );
    return true;
  }
  async add(
    workspaceId: string,
    invoiceId: string,
    version: number,
    input: PaymentInput,
  ) {
    const scope = validateId(workspaceId),
      id = validateId(invoiceId);
    validateLedgerVersion(version);
    const invoice = await this.invoice(scope, id);
    if (invoice.status !== 'issued')
      throw new ApplicationError(
        'PAYMENT_INVOICE_LOCKED',
        'Issue the invoice before recording payments',
      );
    const now = this.now(),
      content = validatePayment(input, invoice.currency, now),
      requestId = input.requestId.toLowerCase();
    const current = await this.store.find(scope, id);
    if (this.replay(current, requestId, content))
      return ledgerView(id, invoice, current);
    if ((current?.version ?? 0) !== version)
      throw new ApplicationError(
        'PAYMENT_CONFLICT',
        'Ledger changed; reload before writing',
      );
    if ((current?.entries.length ?? 0) >= paymentLimit)
      throw new ApplicationError(
        'PAYMENT_LIMIT_REACHED',
        'Invoice payment ledger is full',
      );
    if (content.amountMinor > ledgerView(id, invoice, current).remainingMinor)
      throw new ApplicationError(
        'PAYMENT_OVERPAYMENT',
        'Payment exceeds remaining balance',
      );
    const saved = await this.store.save(scope, id, version, [
      ...(current?.entries ?? []),
      {
        ...content,
        requestId,
        id: validateId(this.newId()),
        createdAt: now,
        voidedAt: null,
        voidReason: null,
      },
    ]);
    if (saved) return ledgerView(id, invoice, saved);
    const latest = await this.store.find(scope, id);
    if (this.replay(latest, requestId, content))
      return ledgerView(id, invoice, latest);
    throw new ApplicationError(
      'PAYMENT_CONFLICT',
      'Ledger changed; reload before writing',
    );
  }
  async void(
    workspaceId: string,
    invoiceId: string,
    paymentId: string,
    version: number,
    reason: string,
  ) {
    const scope = validateId(workspaceId),
      id = validateId(invoiceId),
      entryId = validateId(paymentId),
      voidReason = validateVoidReason(reason);
    validateLedgerVersion(version);
    const invoice = await this.invoice(scope, id);
    if (invoice.status !== 'issued')
      throw new ApplicationError(
        'PAYMENT_INVOICE_LOCKED',
        'Invoice is not issued',
      );
    const current = await this.store.find(scope, id);
    if ((current?.version ?? 0) !== version)
      throw new ApplicationError(
        'PAYMENT_CONFLICT',
        'Ledger changed; reload before writing',
      );
    const entry = current?.entries.find((item) => item.id === entryId);
    if (!current || !entry)
      throw new ApplicationError('PAYMENT_NOT_FOUND', 'Payment not found');
    if (entry.voidedAt) return ledgerView(id, invoice, current);
    const now = this.now(),
      saved = await this.store.save(
        scope,
        id,
        version,
        current.entries.map((item) =>
          item.id === entryId ? { ...item, voidedAt: now, voidReason } : item,
        ),
      );
    if (!saved)
      throw new ApplicationError(
        'PAYMENT_CONFLICT',
        'Ledger changed; reload before writing',
      );
    return ledgerView(id, invoice, saved);
  }
}
