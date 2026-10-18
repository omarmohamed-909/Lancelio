'use client';
import { useI18n } from '../../../i18n/language-provider';

import { notifySuccess } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { useUnsavedChanges } from '../../../shared/hooks/use-unsaved-changes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '../../auth/components/session-provider';
import { ClientPicker } from '../../proposals/components/client-picker';
import type { ProposalClient } from '../../proposals/schemas/proposal';
import { manualProjectSchema } from '../schemas/project';
import type { ManualProjectInput } from '../schemas/project';
import {
  projectApi,
  projectError,
  uncertainProjectWrite,
} from '../services/project-api';
export function ProjectCreate() {
  const { snapshot } = useSession();
  if (snapshot.status !== 'authenticated') return null;
  return <Create key={snapshot.identity.workspace.id} />;
}
function Create() {
  const { t } = useI18n();
  const { manager } = useSession();
  const router = useRouter();
  const lifetime = useRef<AbortController | null>(null);
  const guard = useRef(false);
  const created = useRef(false);
  const unresolved = useRef(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [client, setClient] = useState<ProposalClient | null>(null);
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ManualProjectInput>({
    resolver: zodResolver(manualProjectSchema),
    defaultValues: { clientId: '', title: '', summary: '' },
  });
  useUnsavedChanges(
    isDirty && !uncertain && !createdId,
    t('تخرج من غير إنشاء المشروع؟'),
  );
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!isDirty || uncertain || createdId) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, uncertain, createdId]);
  async function save(input: ManualProjectInput) {
    setNotice('');
    try {
      const controller = lifetime.current;
      if (!controller) return;
      const result = await manager.authorized((token) =>
        projectApi.create(token, input, controller.signal),
      );
      if (!controller.signal.aborted) {
        created.current = true;
        setCreatedId(result.id);
        notifySuccess(t('المشروع اتسجل. جاهز تبدأ الشغل.'), true);
        router.push('/projects/' + result.id);
      }
    } catch (cause: unknown) {
      if (!lifetime.current?.signal.aborted) {
        const ambiguous = uncertainProjectWrite(cause);
        unresolved.current = ambiguous;
        setUncertain(ambiguous);
        setNotice(
          ambiguous
            ? t(
                'مش متأكدين إذا المشروع اتسجل. راجع قائمة المشاريع قبل بداية جديدة.',
              )
            : projectError(cause),
        );
      }
    }
  }
  return (
    <>
      <div className="proposal-page-bar">
        <Link
          href="/projects"
          onClick={(event) => {
            if (isSubmitting) event.preventDefault();
          }}
        >
          {t('الرجوع للمشاريع')}{' '}
        </Link>
        <span className="form-eyebrow">{t('بداية يدوية')}</span>
      </div>
      <div className="dashboard-heading">
        <div>
          <span className="form-eyebrow">{t('عميل وشغل واضح')}</span>
          <h1>
            {t('ابدأ مشروع')}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{t('اختار العميل واكتب الشغل اللي هتبدأه معاه.')}</p>
        </div>
      </div>
      <form
        className="proposal-editor project-create"
        noValidate
        onSubmit={(event) => {
          if (guard.current || created.current || uncertain || isSubmitting) {
            event.preventDefault();
            return;
          }
          guard.current = true;
          void handleSubmit(save)(event).finally(() => {
            guard.current = created.current || unresolved.current;
          });
        }}
      >
        {createdId && (
          <p role="status">
            {t('المشروع اتسجل.')}{' '}
            <Link href={'/projects/' + createdId}>
              {t('فتح المشروع المحفوظ')}
            </Link>
          </p>
        )}
        {notice && (
          <div className="form-notice" role="alert">
            {t(notice)}
            {uncertain && <Link href="/projects">{t('مراجعة المشاريع')}</Link>}
          </div>
        )}
        <fieldset
          className="proposal-paper"
          disabled={isSubmitting || uncertain || createdId !== null}
        >
          <div className="proposal-section-heading">
            <div>
              <span className="form-eyebrow">{t('01 / بداية المشروع')}</span>
              <h2>{t('تفاصيل الشغل')}</h2>
            </div>
          </div>
          <div className="proposal-field">
            <label htmlFor="project-title">{t('اسم المشروع')}</label>
            <input
              id="project-title"
              {...register('title')}
              aria-invalid={!!errors.title}
              aria-describedby={
                errors.title ? 'project-title-error' : undefined
              }
            />
            {errors.title && (
              <p id="project-title-error" className="field-error">
                {t(errors.title.message)}
              </p>
            )}
          </div>
          <input type="hidden" {...register('clientId')} />
          <ClientPicker
            selected={client}
            onSelect={(value) => {
              setClient(value);
              setValue('clientId', value.id, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            error={errors.clientId?.message}
          />
          <div className="proposal-field">
            <label htmlFor="project-summary">
              {t('وصف المشروع')} <span>{t('اختياري')}</span>
            </label>
            <textarea
              id="project-summary"
              rows={4}
              {...register('summary')}
              aria-invalid={!!errors.summary}
              aria-describedby={
                errors.summary ? 'project-summary-error' : undefined
              }
            />
            {errors.summary && (
              <p id="project-summary-error" className="field-error">
                {t(errors.summary.message)}
              </p>
            )}
          </div>
          <p className="field-help project-create-note">
            {t(
              'المشروع هيبدأ نشط. البداية اليدوية ما بتنشئش عرض سعر أو اتفاق مالي.',
            )}{' '}
          </p>
          <button className="button button-primary" type="submit">
            {isSubmitting ? t('بنبدأ المشروع…') : t('إنشاء المشروع')}
          </button>
        </fieldset>
      </form>
    </>
  );
}
