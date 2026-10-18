'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { confirmAction } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { X } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  paymentFormSchema,
  voidFormSchema,
  paymentMethods,
} from '../schemas/payment';
import type { Payment, PaymentInput, PaymentLedger } from '../schemas/payment';
import { formatMoney } from '../../../shared/money';
export type PaymentSelection =
  { kind: 'add' } | { kind: 'void'; payment: Payment };
export function PaymentEditor({
  selection,
  currency,
  ledger,
  pending,
  blocked,
  error,
  onClose,
  onSave,
  onReload,
  returnFocusRef,
}: {
  selection: PaymentSelection;
  currency: string;
  ledger: PaymentLedger;
  pending: boolean;
  blocked: boolean;
  error: string;
  onClose: () => void;
  onSave: (
    input: PaymentInput,
    requestId: string,
    reason: string,
  ) => Promise<boolean>;
  onReload: () => Promise<boolean>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t, intlLocale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null),
    failure = useRef<HTMLDivElement>(null),
    guard = useRef(false);
  const [requestId] = useState(() => crypto.randomUUID()),
    [reason, setReason] = useState(''),
    [reasonError, setReasonError] = useState('');
  const form = useForm<PaymentInput>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: '',
      paidOn: new Date().toISOString().slice(0, 10),
      method: 'bank_transfer',
      reference: '',
      memo: '',
    },
  });
  const dirty = form.formState.isDirty || reason !== '';
  useEffect(() => {
    if (error) failure.current?.focus();
  }, [error]);
  useEffect(() => {
    const element = dialog.current,
      previous = document.activeElement,
      fallback = returnFocusRef.current,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    element
      ?.querySelector<HTMLElement>(
        selection.kind === 'void' ? '#payment-cancel' : '#payment-amount',
      )
      ?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !(previous instanceof HTMLButtonElement && previous.disabled)
      )
        previous.focus();
      else if (fallback?.isConnected && !fallback.disabled) fallback.focus();
      else document.getElementById('payment-heading')?.focus();
    };
  }, [returnFocusRef, selection.kind]);
  useEffect(() => {
    if (!dirty || blocked) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, blocked]);
  async function close() {
    if (pending || guard.current) return;
    if (
      dirty &&
      !blocked &&
      !(await confirmAction(t('تقفل من غير تسجيل التغييرات؟')))
    )
      return;
    onClose();
  }
  async function reload() {
    await onReload();
  }
  async function save(input: PaymentInput) {
    if (
      !(await confirmAction(
        selection.kind === 'add'
          ? t('تأكد إن الدفعة اتستلمت فعلًا. نسجلها؟')
          : t('هنلغي أثر الدفعة في الحساب مع الاحتفاظ بسجلها. نكمل؟'),
      ))
    )
      return;
    if (await onSave(input, requestId, reason)) onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="client-dialog task-dialog payment-dialog"
      aria-labelledby="payment-editor-heading"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="client-dialog-heading">
        <div>
          <span className="form-eyebrow">{t('سجل الفاتورة')}</span>
          <h2 id="payment-editor-heading">
            {selection.kind === 'add' ? t('تسجيل دفعة') : t('إلغاء أثر الدفعة')}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={t('إغلاق نافذة الدفعة')}
          disabled={pending}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <div className="payment-dialog-balance">
        <p>
          {t('المدفوع:')} {formatMoney(ledger.paidMinor, currency, intlLocale)}{' '}
          {t('· المتبقي:')}{' '}
          {formatMoney(ledger.remainingMinor, currency, intlLocale)}
        </p>
        <details>
          <summary>
            {t('راجع الدفعات الحالية (')}
            {ledger.payments.length})
          </summary>
          {ledger.payments.length === 0 ? (
            <p>{t('مفيش دفعات مسجلة.')}</p>
          ) : (
            <ul>
              {ledger.payments.map((payment) => (
                <li key={payment.id}>
                  {formatMoney(payment.amountMinor, currency, intlLocale)} ·{' '}
                  {payment.paidOn} ·{' '}
                  {payment.voidedAt ? t('ملغاة') : t('مسجلة')}
                  {payment.reference && ' · ' + payment.reference}
                </li>
              ))}
            </ul>
          )}
        </details>
        <p className="field-help">
          {t(
            'بعد القراءة، راجع السجل قبل التأكيد. تأكيد نفس محاولة التسجيل مش بيضيفها مرة تانية لو اتسجلت بالفعل.',
          )}{' '}
        </p>
      </div>
      {error && (
        <div ref={failure} tabIndex={-1} className="form-notice" role="alert">
          {t(error)}
          {blocked && (
            <button
              type="button"
              className="proposal-text-button"
              disabled={pending}
              onClick={() => void reload()}
            >
              {t('قراءة سجل الدفعات الحالي')}{' '}
            </button>
          )}
        </div>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (guard.current || pending || blocked) return;
          guard.current = true;
          let submit: Promise<unknown>;
          if (selection.kind === 'void') {
            const result = voidFormSchema.safeParse({ reason });
            if (!result.success) {
              setReasonError(
                result.error.issues[0]?.message ?? t('راجع السبب.'),
              );
              guard.current = false;
              return;
            }
            setReasonError('');
            submit = save(form.getValues());
          } else submit = form.handleSubmit(save)(event);
          void submit.finally(() => {
            guard.current = false;
          });
        }}
      >
        <fieldset className="task-editor-fields" disabled={pending || blocked}>
          {selection.kind === 'void' ? (
            <>
              <p>
                {t('الدفعة')}{' '}
                {formatMoney(
                  selection.payment.amountMinor,
                  currency,
                  intlLocale,
                )}{' '}
                {t(
                  'هتفضل في السجل كملغاة. الإجراء ده تصحيح للسجل، ومش استرداد أموال.',
                )}{' '}
              </p>
              <div className="task-field">
                <label htmlFor="payment-reason">{t('سبب الإلغاء')}</label>
                <textarea
                  id="payment-reason"
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-invalid={!!reasonError}
                  aria-describedby={
                    reasonError ? 'payment-reason-error' : undefined
                  }
                />
                {reasonError && (
                  <p id="payment-reason-error" className="field-error">
                    {reasonError}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="task-field">
                <label htmlFor="payment-amount">
                  {t('المبلغ (')}
                  {currency})
                </label>
                <input
                  id="payment-amount"
                  dir="ltr"
                  inputMode="decimal"
                  {...form.register('amount')}
                  aria-invalid={!!form.formState.errors.amount}
                  aria-describedby={
                    form.formState.errors.amount
                      ? 'payment-amount-error'
                      : undefined
                  }
                />
                {form.formState.errors.amount && (
                  <p id="payment-amount-error" className="field-error">
                    {t(form.formState.errors.amount.message)}
                  </p>
                )}
              </div>
              <div className="task-field">
                <label htmlFor="payment-date">{t('تاريخ الاستلام')}</label>
                <input
                  id="payment-date"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  {...form.register('paidOn')}
                  aria-invalid={!!form.formState.errors.paidOn}
                  aria-describedby={
                    form.formState.errors.paidOn
                      ? 'payment-date-error'
                      : undefined
                  }
                />
                {form.formState.errors.paidOn && (
                  <p id="payment-date-error" className="field-error">
                    {t(form.formState.errors.paidOn.message)}
                  </p>
                )}
              </div>
              <div className="task-field">
                <label htmlFor="payment-method">{t('طريقة الاستلام')}</label>
                <Controller
                  name="method"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      id="payment-method"
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onBlur={field.onBlur}
                      onValueChange={field.onChange}
                    >
                      {Object.entries(paymentMethods).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>
              <div className="task-field">
                <label htmlFor="payment-reference">
                  {t('مرجع الدفعة')} <span>{t('اختياري')}</span>
                </label>
                <input
                  id="payment-reference"
                  {...form.register('reference')}
                  aria-invalid={!!form.formState.errors.reference}
                  aria-describedby={
                    form.formState.errors.reference
                      ? 'payment-reference-error'
                      : undefined
                  }
                />
                {form.formState.errors.reference && (
                  <p id="payment-reference-error" className="field-error">
                    {t(form.formState.errors.reference.message)}
                  </p>
                )}
              </div>
              <div className="task-field">
                <label htmlFor="payment-memo">
                  {t('ملاحظة')} <span>{t('اختياري')}</span>
                </label>
                <textarea
                  id="payment-memo"
                  rows={3}
                  {...form.register('memo')}
                  aria-invalid={!!form.formState.errors.memo}
                  aria-describedby={
                    form.formState.errors.memo
                      ? 'payment-memo-error'
                      : undefined
                  }
                />
                {form.formState.errors.memo && (
                  <p id="payment-memo-error" className="field-error">
                    {t(form.formState.errors.memo.message)}
                  </p>
                )}
              </div>
              <p className="field-help">
                {t(
                  'سجل الدفعات خاص بمساحتك. مفيش تحصيل تلقائي أو إرسال للعميل.',
                )}{' '}
              </p>
            </>
          )}
        </fieldset>
        <div className="client-dialog-actions">
          <button
            id="payment-cancel"
            className="button"
            type="button"
            disabled={pending}
            onClick={close}
          >
            {t('رجوع')}{' '}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending || blocked}
          >
            {pending
              ? t('بنسجل…')
              : selection.kind === 'add'
                ? t('تأكيد تسجيل الدفعة')
                : t('تأكيد إلغاء الأثر')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
