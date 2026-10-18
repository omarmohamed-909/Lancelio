'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { notifySuccess, confirmAction } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { useUnsavedChanges } from '../../../shared/hooks/use-unsaved-changes';
import type { FormEvent, MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import { formatMoney, previewTotal, decimalPrice } from '../../../shared/money';
import { draftSchema } from '../../../shared/schemas/priced-document';
import type { DraftInput } from '../../../shared/schemas/priced-document';
import { PricedItems } from '../../../shared/components/priced-items';
import { ClientPicker } from '../../proposals/components/client-picker';
import type { ProposalClient } from '../../proposals/schemas/proposal';
import { InvoiceLoader } from './invoice-loader';
import type { Invoice } from '../schemas/invoice';
import { InvoiceProjectPicker } from './invoice-project-picker';
import { invoiceApi, invoiceError } from '../services/invoice-api';
export function InvoiceCreate({ id }: { id?: string }) {
  const { t } = useI18n();
  const { snapshot } = useSession();
  if (snapshot.status !== 'authenticated') return null;
  if (id)
    return (
      <InvoiceLoader id={id}>
        {(invoice, reload) =>
          invoice.status === 'draft' ? (
            <Create
              key={invoice.id + ':' + invoice.version}
              invoice={invoice}
              reload={reload}
            />
          ) : (
            <section className="proposal-state">
              <h1>{t('الفاتورة للقراءة فقط')}</h1>
              <p>{t('تعديل البنود متاح في المسودة فقط.')}</p>
              <Link href={'/invoices/' + invoice.id}>{t('راجع الفاتورة')}</Link>
            </section>
          )
        }
      </InvoiceLoader>
    );
  return <Create key={snapshot.identity.workspace.id} />;
}
function Create({
  invoice,
  reload,
}: {
  invoice?: Invoice;
  reload?: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const { manager } = useSession(),
    router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [client, setClient] = useState<ProposalClient | null>(
      invoice?.client ?? null,
    ),
    [projectId, setProjectId] = useState<string | null>(
      invoice?.project?.id ?? null,
    ),
    [createdId, setCreatedId] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [uncertain, setUncertain] = useState(false),
    [busy, setBusy] = useState(false);
  const guard = useRef(false),
    created = useRef(false),
    unresolved = useRef(false),
    lifetime = useRef<AbortController | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<DraftInput>({
    resolver: zodResolver(draftSchema),
    defaultValues: invoice
      ? {
          clientId: invoice.client.id,
          title: invoice.title,
          summary: invoice.summary,
          terms: invoice.terms,
          currency: invoice.currency,
          items: invoice.items.map((item) => ({
            title: item.title,
            quantity: item.quantity,
            unitPrice: decimalPrice(item.unitPriceMinor),
          })),
        }
      : {
          clientId: '',
          title: '',
          summary: '',
          terms: '',
          currency: 'EGP',
          items: [{ title: '', quantity: 1, unitPrice: '' }],
        },
  });
  const items = useWatch({ control, name: 'items' }),
    currency = useWatch({ control, name: 'currency' }),
    total = previewTotal(items),
    itemGroupError = errors.items?.root?.message ?? errors.items?.message,
    hasChanges = isDirty || projectId !== (invoice?.project?.id ?? null);
  useUnsavedChanges(
    hasChanges && !uncertain && !createdId,
    t('تخرج من غير حفظ الفاتورة؟'),
  );
  useEffect(() => {
    if (total !== null && itemGroupError) void trigger('items');
  }, [total, itemGroupError, trigger]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!hasChanges || uncertain || createdId) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges, uncertain, createdId]);
  async function save(input: DraftInput) {
    setBusy(true);
    setNotice('');
    try {
      const controller = lifetime.current;
      if (!controller) return;
      const result = await manager.authorized((token) =>
        invoice
          ? invoiceApi.update(
              token,
              invoice.id,
              invoice.version,
              input,
              projectId,
              controller.signal,
            )
          : invoiceApi.create(
              token,
              input,
              requestId,
              projectId,
              controller.signal,
            ),
      );
      if (!controller.signal.aborted) {
        created.current = true;
        setCreatedId(result.id);
        notifySuccess(t('مسودة الفاتورة اتحفظت.'), true);
        router.push('/invoices/' + result.id);
      }
    } catch (cause: unknown) {
      if (!lifetime.current?.signal.aborted) {
        const ambiguous =
          !(cause instanceof ApiError) ||
          cause.status === 0 ||
          cause.status >= 500;
        const conflict =
          cause instanceof ApiError &&
          (cause.code === 'INVOICE_CONFLICT' ||
            cause.code === 'INVOICE_LOCKED');
        unresolved.current = ambiguous || conflict;
        setUncertain(ambiguous || conflict);
        setNotice(
          ambiguous
            ? t(
                'مش متأكدين إذا الفاتورة اتسجلت. راجع دفتر الفواتير قبل بداية جديدة.',
              )
            : invoiceError(cause),
        );
      }
    } finally {
      if (!lifetime.current?.signal.aborted) {
        setBusy(false);
        guard.current = created.current || unresolved.current;
      }
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guard.current || created.current || unresolved.current) return;
    guard.current = true;
    void handleSubmit(save, () => {
      guard.current = false;
    })(event);
  }
  function cancel(event: MouseEvent<HTMLAnchorElement>) {
    if (busy) event.preventDefault();
  }
  return (
    <>
      <div className="proposal-page-bar">
        <Link
          href={invoice ? '/invoices/' + invoice.id : '/invoices'}
          onClick={cancel}
        >
          <ArrowRight size={16} />
          {invoice ? t('رجوع للفاتورة') : t('كل الفواتير')}
        </Link>
        <span className="proposal-status">{t('مسودة خاصة')}</span>
      </div>
      <div className="dashboard-heading">
        <div>
          <span className="form-eyebrow">
            {invoice
              ? t('الفواتير / تعديل المسودة')
              : t('الفواتير / مسودة جديدة')}
          </span>
          <h1>
            {invoice ? t('تعديل المسودة') : t('اكتب فاتورتك')}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{t('العميل، المشروع الاختياري، وكل بند بسعره.')}</p>
        </div>
      </div>
      <form className="proposal-editor" onSubmit={submit} noValidate>
        <div className="proposal-editor-body">
          {createdId && (
            <p role="status">
              {t('الفاتورة اتسجلت.')}{' '}
              <Link href={'/invoices/' + createdId}>
                {t('فتح الفاتورة المحفوظة')}
              </Link>
            </p>
          )}
          {notice && (
            <div className="form-notice" role="alert">
              {t(notice)}
              {uncertain && reload && (
                <button
                  className="proposal-text-button"
                  type="button"
                  onClick={async () => {
                    if (
                      !hasChanges ||
                      (await confirmAction(
                        t('هنحمّل آخر نسخة؛ التعديلات هنا مش هتتحفظ.'),
                      ))
                    )
                      reload();
                  }}
                >
                  {t('تحميل آخر نسخة')}{' '}
                </button>
              )}
              {uncertain && (
                <Link href="/invoices">{t('مراجعة دفتر الفواتير')}</Link>
              )}
            </div>
          )}
          <fieldset
            className="proposal-form-fields"
            disabled={busy || uncertain || createdId !== null}
          >
            <section className="proposal-paper">
              <div className="proposal-section-heading">
                <div>
                  <span className="form-eyebrow">
                    {t('01 / تفاصيل الفاتورة')}
                  </span>
                  <h2>{t('تفاصيل الفاتورة')}</h2>
                </div>
              </div>
              <div className="proposal-field">
                <label htmlFor="proposal-title">{t('عنوان الفاتورة')}</label>
                <input
                  id="proposal-title"
                  placeholder={t('مثال: تصميم هوية مطعم ورقة')}
                  {...register('title')}
                  aria-invalid={!!errors.title}
                  aria-describedby={
                    errors.title ? 'proposal-title-error' : undefined
                  }
                />
                {errors.title && (
                  <p id="proposal-title-error" className="field-error">
                    {t(errors.title.message)}
                  </p>
                )}
              </div>
              <input type="hidden" {...register('clientId')} />
              <ClientPicker
                searchLabel={t('البحث عن عميل للفاتورة')}
                selected={client}
                error={errors.clientId?.message}
                onSelect={(value) => {
                  setClient(value);
                  setProjectId(null);
                  setValue('clientId', value.id, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
              />
              {client && (
                <InvoiceProjectPicker
                  key={client.id}
                  clientId={client.id}
                  {...(invoice?.project ? { retained: invoice.project } : {})}
                  value={projectId}
                  onChange={setProjectId}
                />
              )}
              <div className="proposal-field">
                <label htmlFor="proposal-summary">
                  {t('نطاق الشغل')} <span>{t('اختياري')}</span>
                </label>
                <textarea
                  id="proposal-summary"
                  rows={3}
                  placeholder={t(
                    'الهدف من الشغل، وإيه اللي هيتسلّم في النهاية…',
                  )}
                  {...register('summary')}
                  aria-invalid={!!errors.summary}
                  aria-describedby={
                    errors.summary ? 'proposal-summary-error' : undefined
                  }
                />
                {errors.summary && (
                  <p id="proposal-summary-error" className="field-error">
                    {t(errors.summary.message)}
                  </p>
                )}
              </div>
            </section>
            <PricedItems
              control={control}
              register={register}
              errors={errors}
            />
            <section className="proposal-paper">
              <div className="proposal-section-heading">
                <div>
                  <span className="form-eyebrow">{t('03 / شروط الاتفاق')}</span>
                  <h2>{t('شروط الاتفاق')}</h2>
                </div>
              </div>
              <div className="proposal-field">
                <label htmlFor="proposal-terms">
                  {t('الشروط')} <span>{t('اختياري')}</span>
                </label>
                <textarea
                  id="proposal-terms"
                  rows={3}
                  placeholder={t('مدة التنفيذ، عدد التعديلات، وطريقة الدفع…')}
                  {...register('terms')}
                  aria-invalid={!!errors.terms}
                  aria-describedby={
                    errors.terms ? 'proposal-terms-error' : undefined
                  }
                />
                {errors.terms && (
                  <p id="proposal-terms-error" className="field-error">
                    {t(errors.terms.message)}
                  </p>
                )}
              </div>
            </section>
          </fieldset>
        </div>
        <aside className="proposal-tally">
          <span className="form-eyebrow">{t('ملخّص الفاتورة')}</span>
          <h2>{t('قبل الحفظ')}</h2>
          <label htmlFor="proposal-currency">{t('عملة الفاتورة')}</label>
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <Select
                id="proposal-currency"
                name={field.name}
                ref={field.ref}
                value={field.value}
                onBlur={field.onBlur}
                onValueChange={field.onChange}
                disabled={busy || uncertain || createdId !== null}
              >
                <option value="EGP">{t('جنيه مصري · EGP')}</option>
                <option value="USD">{t('دولار أمريكي · USD')}</option>
                <option value="EUR">{t('يورو · EUR')}</option>
                <option value="SAR">{t('ريال سعودي · SAR')}</option>
              </Select>
            )}
          />
          <div
            className="proposal-preview-total"
            aria-live="polite"
            aria-atomic="true"
          >
            <span>{t('الإجمالي المبدئي')}</span>
            <strong>
              {total === null ? '—' : formatMoney(total, currency, intlLocale)}
            </strong>
            <small>
              {items.length} {t('بند · بدون ضرائب أو خصومات')}
            </small>
          </div>
          <p className="field-help">
            {t(
              'كل الأسعار بالعملة المختارة. تغيير العملة لا يحوّل الأسعار.',
            )}{' '}
          </p>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || uncertain || createdId !== null}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}{' '}
            {busy ? t('بنحفظ المسودة…') : t('حفظ المسودة')}
          </button>
          <Link className="proposal-cancel" href={'/invoices'} onClick={cancel}>
            {t('إلغاء والرجوع')}{' '}
          </Link>
          <p className="proposal-tally-note">
            {invoice
              ? t('رقم الفاتورة ثابت. التعديل متاح لحد الإصدار.')
              : t('الرقم بيتحدد عند الحفظ. المسودة خاصة ومش بتتبعت للعميل.')}
          </p>
        </aside>
      </form>
    </>
  );
}
