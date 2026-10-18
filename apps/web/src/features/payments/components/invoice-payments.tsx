'use client';
import { useI18n } from '../../../i18n/language-provider';

import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { usePaymentLedger } from '../hooks/use-payment-ledger';
import { paymentApi } from '../services/payment-api';
import { paymentMethods } from '../schemas/payment';
import type { PaymentInput } from '../schemas/payment';
import { PaymentEditor } from './payment-editor';
import type { PaymentSelection } from './payment-editor';
import { formatMoney } from '../../../shared/money';
const labels = {
  not_issued: 'مسودة · إصدارها مطلوب',
  unpaid: 'لسه بدون دفعات',
  partially_paid: 'مدفوعة جزئيًا',
  paid: 'مسددة',
};
export function InvoicePayments({ invoiceId }: { invoiceId: string }) {
  const { snapshot } = useSession();
  if (snapshot.status !== 'authenticated') return null;
  return (
    <Ledger
      key={snapshot.identity.workspace.id + ':' + invoiceId}
      invoiceId={invoiceId}
    />
  );
}
function Ledger({ invoiceId }: { invoiceId: string }) {
  const { t, intlLocale } = useI18n();
  const state = usePaymentLedger(invoiceId),
    [selection, setSelection] = useState<PaymentSelection | null>(null),
    add = useRef<HTMLButtonElement>(null),
    failure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error && !selection) failure.current?.focus();
  }, [state.error, selection]);
  const ledger = state.ledger;
  async function save(input: PaymentInput, requestId: string, reason: string) {
    if (!selection) return false;
    return state.write(
      (token, version, signal) =>
        selection.kind === 'add'
          ? paymentApi.add(token, invoiceId, version, requestId, input, signal)
          : paymentApi.void(
              token,
              invoiceId,
              selection.payment.id,
              version,
              reason,
              signal,
            ),
      selection.kind === 'add'
        ? t('الدفعة اتسجلت.')
        : t('أثر الدفعة اتلغى، وسجلها محفوظ.'),
    );
  }
  return (
    <section className="payment-ledger" aria-labelledby="payment-heading">
      <div className="task-board-heading">
        <div>
          <span className="form-eyebrow">{t('حساب الفاتورة')}</span>
          <h2 id="payment-heading" tabIndex={-1}>
            {t('سجل الدفعات')}{' '}
          </h2>
          <p>{t('دفعات استلمتها وسجلتها يدويًا، كل واحدة بتاريخها.')}</p>
        </div>
        <div className="task-board-tools">
          <button
            type="button"
            className="button"
            disabled={state.pending || selection !== null}
            onClick={() => void state.reload()}
          >
            {t('قراءة سجل الدفعات الحالي')}{' '}
          </button>
          {ledger?.invoiceStatus === 'issued' &&
            ledger.remainingMinor > 0 &&
            ledger.payments.length < 200 && (
              <button
                ref={add}
                type="button"
                className="button button-primary"
                disabled={state.pending || state.blocked || selection !== null}
                onClick={() => setSelection({ kind: 'add' })}
              >
                {t('تسجيل دفعة')}{' '}
              </button>
            )}
        </div>
      </div>
      {state.error && !selection && (
        <div ref={failure} tabIndex={-1} className="form-notice" role="alert">
          {t(state.error)}
        </div>
      )}
      {state.pending && !ledger && (
        <LoadingPlaceholder label={t('بنقرأ الدفعات…')} />
      )}
      {state.notice && (
        <p className="form-success" role="status">
          {t(state.notice)}
        </p>
      )}
      {ledger && (
        <>
          <div
            className="payment-balance"
            data-payment-status={ledger.paymentStatus}
          >
            <span className="proposal-status">
              {t(labels[ledger.paymentStatus])}
            </span>
            <dl>
              <div>
                <dt>{t('إجمالي الفاتورة')}</dt>
                <dd>
                  {formatMoney(ledger.totalMinor, ledger.currency, intlLocale)}
                </dd>
              </div>
              <div>
                <dt>{t('المدفوع')}</dt>
                <dd data-testid="paid-balance">
                  {formatMoney(ledger.paidMinor, ledger.currency, intlLocale)}
                </dd>
              </div>
              <div>
                <dt>{t('المتبقي')}</dt>
                <dd data-testid="remaining-balance">
                  {formatMoney(
                    ledger.remainingMinor,
                    ledger.currency,
                    intlLocale,
                  )}
                </dd>
              </div>
            </dl>
          </div>
          {ledger.invoiceStatus === 'draft' && (
            <p className="field-help">
              {t('إصدار الفاتورة مطلوب قبل تسجيل دفعاتها.')}{' '}
            </p>
          )}
          {ledger.payments.length === 0 ? (
            <p className="payment-empty">
              {ledger.totalMinor === 0 && ledger.invoiceStatus === 'issued'
                ? t('إجمالي الفاتورة صفر؛ مفيش دفعة مطلوبة.')
                : t('لسه مفيش دفعات مسجلة.')}
            </p>
          ) : (
            <ol className="payment-entries">
              {[...ledger.payments].reverse().map((payment) => (
                <li key={payment.id} data-voided={payment.voidedAt !== null}>
                  <div className="payment-entry-heading">
                    <strong>
                      {formatMoney(
                        payment.amountMinor,
                        ledger.currency,
                        intlLocale,
                      )}
                    </strong>
                    <span>
                      {payment.voidedAt
                        ? t('ملغاة')
                        : t(paymentMethods[payment.method])}{' '}
                      ·{' '}
                      {new Intl.DateTimeFormat(intlLocale, {
                        dateStyle: 'medium',
                        timeZone: 'UTC',
                      }).format(new Date(payment.paidOn + 'T00:00:00.000Z'))}
                    </span>
                    {!payment.voidedAt && (
                      <button
                        type="button"
                        className="button"
                        disabled={
                          state.pending || state.blocked || selection !== null
                        }
                        onClick={() => setSelection({ kind: 'void', payment })}
                      >
                        {t('إلغاء أثر الدفعة')}{' '}
                      </button>
                    )}
                  </div>
                  {payment.reference && (
                    <p>
                      {t('المرجع:')} {payment.reference}
                    </p>
                  )}
                  {payment.memo && <p>{payment.memo}</p>}
                  {payment.voidedAt && (
                    <p className="payment-void-note">
                      {t('سبب الإلغاء:')} {payment.voidReason} ·{' '}
                      {new Intl.DateTimeFormat(intlLocale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(payment.voidedAt))}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {selection && ledger && (
        <PaymentEditor
          key={selection.kind === 'add' ? 'add' : selection.payment.id}
          selection={selection}
          currency={ledger.currency}
          ledger={ledger}
          pending={state.pending}
          blocked={state.blocked}
          error={state.error}
          onClose={() => setSelection(null)}
          onSave={save}
          onReload={state.reload}
          returnFocusRef={add}
        />
      )}
    </section>
  );
}
