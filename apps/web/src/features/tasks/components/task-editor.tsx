'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { confirmAction } from '../../../components/ui/feedback';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { X } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { taskFormSchema, taskPriorities } from '../schemas/task';
import type { Task, TaskInput } from '../schemas/task';
export type TaskSelection =
  { kind: 'create' } | { kind: 'edit' | 'delete' | 'visibility'; task: Task };
export function TaskEditor({
  selection,
  pending,
  blocked,
  error,
  onClose,
  onSave,
  onReload,
  returnFocusRef,
}: {
  selection: TaskSelection;
  pending: boolean;
  blocked: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<boolean>;
  onReload: () => Promise<boolean>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const failure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) failure.current?.focus();
  }, [error]);
  const dialog = useRef<HTMLDialogElement>(null),
    guard = useRef(false);
  const form = useForm<TaskInput>({
    resolver: zodResolver(taskFormSchema),
    defaultValues:
      selection.kind === 'create'
        ? { title: '', description: '', priority: 'normal' }
        : selection.task,
  });
  useEffect(() => {
    const element = dialog.current,
      previous = document.activeElement,
      fallback = returnFocusRef.current,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    element
      ?.querySelector<HTMLElement>(
        selection.kind === 'delete' || selection.kind === 'visibility'
          ? '#task-dialog-cancel'
          : '#task-title',
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
      else document.getElementById('task-board-heading')?.focus();
    };
  }, [returnFocusRef, selection.kind]);
  useEffect(() => {
    if (!form.formState.isDirty || blocked) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [form.formState.isDirty, blocked]);
  async function close() {
    if (pending || guard.current) return;
    if (
      form.formState.isDirty &&
      !blocked &&
      selection.kind !== 'delete' &&
      !(await confirmAction(t('تقفل من غير حفظ التغييرات؟')))
    )
      return;
    onClose();
  }
  async function reload() {
    if (
      form.formState.isDirty &&
      !(await confirmAction(
        t('هنحمّل المهام الحالية. التغييرات اللي كتبتها مش هتتحفظ.'),
      ))
    )
      return;
    if (await onReload()) onClose();
  }
  async function save(input: TaskInput) {
    if (await onSave(input)) onClose();
  }
  return (
    <dialog
      className="client-dialog task-dialog"
      ref={dialog}
      aria-labelledby="task-editor-heading"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="client-dialog-heading">
        <div>
          <span className="form-eyebrow">{t('خطوة في المشروع')}</span>
          <h2 id="task-editor-heading">
            {selection.kind === 'create'
              ? t('مهمة جديدة')
              : selection.kind === 'edit'
                ? t('تعديل المهمة')
                : selection.kind === 'visibility'
                  ? t('ظهور المهمة للعميل')
                  : t('حذف المهمة')}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label={t('إغلاق نافذة المهمة')}
          disabled={pending}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {error && (
        <div ref={failure} tabIndex={-1} className="form-notice" role="alert">
          {t(error)}
          {blocked && (
            <button
              className="proposal-text-button"
              disabled={pending}
              onClick={() => void reload()}
            >
              {t('قراءة المهام الحالية')}{' '}
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
          const submit =
            selection.kind === 'delete' || selection.kind === 'visibility'
              ? save({ title: '', description: '', priority: 'normal' })
              : form.handleSubmit(save)(event);
          void submit.finally(() => {
            guard.current = false;
          });
        }}
      >
        <fieldset className="task-editor-fields" disabled={pending || blocked}>
          {selection.kind === 'delete' ? (
            <p className="task-delete-copy">
              {t('حذف «')}
              {selection.task.title}
              {t(
                '» نهائي من قائمة المهام. باقي المشروع والاتفاق هيفضلوا محفوظين.',
              )}{' '}
            </p>
          ) : selection.kind === 'visibility' ? (
            <div className="task-visibility-confirm">
              <p>
                {selection.task.clientVisible ? t('هتخفي') : t('هتسمح بعرض')} «
                {selection.task.title}»{' '}
                {selection.task.clientVisible
                  ? t('من متابعة العميل.')
                  : t('بعنوانها ووصفها وحالتها في متابعة العميل.')}
              </p>
              <p className="proposal-footnote">
                {t(
                  'الاختيار بيجهّز المهام لبوابة العميل عند إتاحتها؛ مفيش رابط متابعة مشارَك حاليًا. باقي المهام الخاصة مش هتظهر.',
                )}{' '}
              </p>
            </div>
          ) : (
            <>
              <div className="task-field">
                <label htmlFor="task-title">{t('اسم المهمة')}</label>
                <input
                  id="task-title"
                  {...form.register('title')}
                  aria-invalid={!!form.formState.errors.title}
                  aria-describedby={
                    form.formState.errors.title ? 'task-title-error' : undefined
                  }
                />
                {form.formState.errors.title && (
                  <p className="field-error" id="task-title-error">
                    {t(form.formState.errors.title.message)}
                  </p>
                )}
              </div>
              <div className="task-field">
                <label htmlFor="task-description">
                  {t('وصف المهمة')} <span>{t('اختياري')}</span>
                </label>
                <textarea
                  id="task-description"
                  rows={4}
                  {...form.register('description')}
                  aria-invalid={!!form.formState.errors.description}
                  aria-describedby={
                    form.formState.errors.description
                      ? 'task-description-error'
                      : undefined
                  }
                />
                {form.formState.errors.description && (
                  <p className="field-error" id="task-description-error">
                    {t(form.formState.errors.description.message)}
                  </p>
                )}
              </div>
              <div className="task-field">
                <label htmlFor="task-priority">{t('أولوية المهمة')}</label>
                <Controller
                  name="priority"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      id="task-priority"
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onBlur={field.onBlur}
                      onValueChange={field.onChange}
                    >
                      {Object.entries(taskPriorities).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>
            </>
          )}
          <div className="client-dialog-actions">
            <button className="button button-primary" type="submit">
              {pending
                ? t('بنحفظ…')
                : selection.kind === 'delete'
                  ? t('تأكيد حذف المهمة')
                  : selection.kind === 'edit'
                    ? t('حفظ المهمة')
                    : selection.kind === 'visibility'
                      ? selection.task.clientVisible
                        ? t('تأكيد الإخفاء')
                        : t('تأكيد السماح بالعرض')
                      : t('إضافة المهمة')}
            </button>
            <button
              className="button button-secondary"
              type="button"
              id="task-dialog-cancel"
              onClick={close}
            >
              {t('إلغاء')}{' '}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  );
}
