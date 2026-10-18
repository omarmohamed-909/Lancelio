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
import { decimalPrice, formatMoney, previewTotal } from '../money';
import { draftSchema } from '../schemas/proposal';
import type { DraftInput, Proposal, ProposalClient } from '../schemas/proposal';
import { proposalApi, proposalError } from '../services/proposal-api';
import { ClientPicker } from './client-picker';
import { ProposalItems } from './proposal-items';
import { ProposalLoader } from './proposal-loader';
export function ProposalEditorScreen({ id }: { id?: string }) {
  const { t } = useI18n();
  const { snapshot } = useSession();
  if (snapshot.status !== 'authenticated') return null;
  if (id)
    return (
      <ProposalLoader id={id}>
        {(proposal, reload) =>
          proposal.status === 'draft' ? (
            <ProposalEditor
              key={proposal.id + ':' + proposal.version}
              proposal={proposal}
              reload={reload}
            />
          ) : (
            <section className="proposal-state">
              <h1>{t('العرض للقراءة فقط')}</h1>
              <p>{t('تعديل البنود متاح في مرحلة المسودة فقط.')}</p>
              <Link className="button button-primary" href={'/proposals/' + id}>
                {t('راجع العرض')}{' '}
              </Link>
            </section>
          )
        }
      </ProposalLoader>
    );
  return <ProposalEditor key={snapshot.identity.workspace.id} />;
}
function ProposalEditor({
  proposal,
  reload,
}: {
  proposal?: Proposal;
  reload?: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const router = useRouter();
  const { manager } = useSession();
  const [client, setClient] = useState<ProposalClient | null>(
    proposal?.client ?? null,
  );
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const mounted = useRef(true);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<DraftInput>({
    resolver: zodResolver(draftSchema),
    defaultValues: proposal
      ? {
          clientId: proposal.client.id,
          title: proposal.title,
          summary: proposal.summary,
          terms: proposal.terms,
          currency: proposal.currency,
          items: proposal.items.map((item) => ({
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
  const items = useWatch({ control, name: 'items' });
  const currency = useWatch({ control, name: 'currency' });
  const total = previewTotal(items);
  const itemGroupError = errors.items?.root?.message ?? errors.items?.message;
  useUnsavedChanges(isDirty && !uncertain, t('تخرج من غير حفظ التعديلات؟'));
  useEffect(() => {
    if (total !== null && itemGroupError) void trigger('items');
  }, [total, itemGroupError, trigger]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!isDirty || uncertain) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, uncertain]);
  async function save(body: DraftInput) {
    let blocked = true;
    setBusy(true);
    setNotice('');
    setConflict(false);
    try {
      const saved = await manager.authorized((token) =>
        proposal
          ? proposalApi.update(token, proposal.id, proposal.version, body)
          : proposalApi.create(token, body),
      );
      if (mounted.current) {
        notifySuccess(t('عرض السعر اتحفظ.'), true);
        router.push('/proposals/' + saved.id);
      }
    } catch (error: unknown) {
      if (!mounted.current) return;
      const ambiguous =
        error instanceof ApiError &&
        (error.status === 0 || error.status >= 500);
      setUncertain(ambiguous);
      blocked = ambiguous;
      setConflict(
        error instanceof ApiError &&
          (error.code === 'PROPOSAL_CONFLICT' ||
            error.code === 'PROPOSAL_LOCKED'),
      );
      setNotice(
        ambiguous
          ? t(
              'مش قادرين نتأكد إن الحفظ وصل. افتح دفتر العروض وراجع آخر نسخة قبل ما تعيد الحفظ.',
            )
          : proposalError(error),
      );
    } finally {
      if (mounted.current) {
        setBusy(false);
        guard.current = blocked;
      }
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guard.current || uncertain) return;
    guard.current = true;
    void handleSubmit(save, () => {
      guard.current = false;
    })(event);
  }
  function cancel(event: MouseEvent<HTMLAnchorElement>) {
    if (busy) event.preventDefault();
  }
  async function latest() {
    if (!reload) return;
    if (
      !isDirty ||
      (await confirmAction(
        t('هنحمّل آخر نسخة. التعديلات اللي كتبتها هنا مش هتتحفظ.'),
      ))
    )
      reload();
  }
  return (
    <>
      <div className="proposal-page-bar">
        <Link
          href={proposal ? '/proposals/' + proposal.id : '/proposals'}
          onClick={cancel}
        >
          <ArrowRight size={16} />
          {proposal ? t('الرجوع للعرض') : t('كل العروض')}
        </Link>
        <span className="proposal-status">{t('مسودة خاصة')}</span>
      </div>
      <div className="dashboard-heading">
        <div>
          <span className="form-eyebrow">{t('عروض الأسعار / تحرير')}</span>
          <h1>
            {proposal ? t('تعديل المسودة') : t('اكتب عرضك')}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{t('العميل، نطاق الشغل، وكل بند بسعره.')}</p>
        </div>
      </div>
      <form className="proposal-editor" onSubmit={submit} noValidate>
        <div className="proposal-editor-body">
          {notice && (
            <div className="form-notice" role="alert">
              {t(notice)}
              {conflict && (
                <button
                  type="button"
                  className="proposal-text-button"
                  onClick={latest}
                >
                  {t('تحميل آخر نسخة')}{' '}
                </button>
              )}
              {uncertain && (
                <Link href="/proposals">{t('مراجعة دفتر العروض')}</Link>
              )}
            </div>
          )}
          <fieldset
            className="proposal-form-fields"
            disabled={busy || uncertain}
          >
            <section className="proposal-paper">
              <div className="proposal-section-heading">
                <div>
                  <span className="form-eyebrow">
                    {t('01 / تفاصيل الاتفاق')}
                  </span>
                  <h2>{t('تفاصيل العرض')}</h2>
                </div>
              </div>
              <div className="proposal-field">
                <label htmlFor="proposal-title">{t('عنوان العرض')}</label>
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
                selected={client}
                error={errors.clientId?.message}
                onSelect={(value) => {
                  setClient(value);
                  setValue('clientId', value.id, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
              />
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
            <ProposalItems
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
          <span className="form-eyebrow">{t('ملخّص العرض')}</span>
          <h2>{t('قبل الحفظ')}</h2>
          <label htmlFor="proposal-currency">{t('عملة العرض')}</label>
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
                disabled={busy || uncertain}
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
            disabled={busy || uncertain}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}{' '}
            {busy ? t('بنحفظ المسودة…') : t('حفظ المسودة')}
          </button>
          <Link
            className="proposal-cancel"
            href={proposal ? '/proposals/' + proposal.id : '/proposals'}
            onClick={cancel}
          >
            {t('إلغاء والرجوع')}{' '}
          </Link>
          <p className="proposal-tally-note">
            {t('المسودة خاصة بمساحتك، ومش بتتبعت للعميل.')}{' '}
          </p>
        </aside>
      </form>
    </>
  );
}
