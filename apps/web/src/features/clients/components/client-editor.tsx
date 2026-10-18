'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, X, Archive, Users } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { errorMessage } from '../../auth/services/auth-api';
import { ApiError } from '../../../shared/api/http-client';
import {
  clientApi,
  clientFormSchema,
  clientError,
} from '../services/client-api';
import type { Client, ClientDetails } from '../services/client-api';
export interface EditorSelection {
  client: Client | null;
  archive: boolean;
}
const empty: ClientDetails = {
  name: '',
  email: '',
  phone: '',
  company: '',
  notes: '',
};
const fields = [
  { key: 'name', label: 'اسم العميل', type: 'text' },
  { key: 'company', label: 'الشركة', type: 'text' },
  { key: 'email', label: 'بريد العميل', type: 'email' },
  { key: 'phone', label: 'رقم الهاتف', type: 'tel' },
  { key: 'notes', label: 'ملاحظات', type: 'text' },
] as const;
export function ClientEditor({
  selection,
  onClose,
  onSaved,
  returnFocusRef,
}: {
  selection: EditorSelection;
  onClose: () => void;
  onSaved: (message: string) => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const { manager } = useSession();
  const [client, setClient] = useState(selection.client);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const readonly =
    client?.archivedAt !== null && client?.archivedAt !== undefined;
  const form = useForm<ClientDetails>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: client ?? empty,
  });
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const fallback = returnFocusRef?.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    element?.querySelector<HTMLInputElement>('#client-name')?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      else if (fallback?.isConnected) fallback.focus();
    };
  }, [returnFocusRef]);
  async function submit(details: ClientDetails) {
    setPending(true);
    setMessage('');
    setConflict(false);
    try {
      if (selection.archive && client)
        await manager.authorized((token) => clientApi.archive(token, client));
      else if (client)
        await manager.authorized((token) =>
          clientApi.update(token, client, details),
        );
      else
        await manager.authorized((token) => clientApi.create(token, details));
      onSaved(
        selection.archive
          ? t('العميل اتنقل للأرشيف، وتفاصيله محفوظة.')
          : client
            ? t('تم حفظ التعديلات.')
            : t('العميل اتضاف لدفترك.'),
      );
    } catch (error: unknown) {
      const network =
        error instanceof ApiError &&
        (error.code === 'NETWORK_ERROR' || error.status >= 500);
      setUncertain(network);
      setConflict(
        error instanceof ApiError && error.code === 'CLIENT_CONFLICT',
      );
      setMessage(
        network
          ? t(
              'مش قادرين نتأكد إن الحفظ تم. اقفل النافذة وحدّث القائمة قبل ما تعيد المحاولة.',
            )
          : clientError(error) || errorMessage(error),
      );
    } finally {
      setPending(false);
    }
  }
  async function latest() {
    if (!client || submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      const fresh = await manager.authorized((token) =>
        clientApi.read(token, client.id),
      );
      setClient(fresh);
      form.reset(fresh);
      setConflict(false);
      setMessage(t('تم تحميل آخر نسخة. راجع البيانات قبل الحفظ.'));
    } catch (error: unknown) {
      setMessage(clientError(error) || errorMessage(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <dialog
      className="client-dialog"
      ref={dialog}
      aria-labelledby="client-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting.current) onClose();
      }}
    >
      <div className="client-dialog-heading">
        <div>
          <span className="form-eyebrow">{t('دفتر العملاء')}</span>
          <h2 id="client-editor-title">
            {selection.archive
              ? t('أرشفة العميل')
              : readonly
                ? t('بيانات العميل المؤرشف')
                : client
                  ? t('تعديل بيانات العميل')
                  : t('عميل جديد')}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label={t('إغلاق النافذة')}
          disabled={pending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          if (submitting.current || readonly || uncertain) {
            event.preventDefault();
            return;
          }
          submitting.current = true;
          const action = selection.archive
            ? async () => {
                event.preventDefault();
                await submit(empty);
              }
            : () => form.handleSubmit(submit)(event);
          void action().finally(() => {
            submitting.current = false;
          });
        }}
      >
        {selection.archive ? (
          <div className="archive-explanation">
            <Archive size={30} />
            <p>
              {t('تنقل')} <strong>{client?.name}</strong> {t('للأرشيف؟')}{' '}
            </p>
            <span>
              {t(
                'هتفضل بياناته محفوظة وتقدر تشوفها في المؤرشفين. تعديل العميل هيتوقف بعد الأرشفة.',
              )}{' '}
            </span>
          </div>
        ) : (
          <>
            <p className="client-form-intro">
              {readonly
                ? t('السجل محفوظ للرجوع إليه.')
                : t('الاسم كفاية كبداية. كمّل باقي التفاصيل لما تحتاجها.')}
            </p>
            <div className="client-fields">
              {fields.map(({ key, label, type }) => (
                <div
                  className={key === 'notes' ? 'field client-notes' : 'field'}
                  key={key}
                >
                  <label htmlFor={'client-' + key}>
                    {t(label)}
                    {key !== 'name' && (
                      <span className="optional-label">{t('اختياري')}</span>
                    )}
                  </label>
                  {key === 'notes' ? (
                    <textarea
                      id={'client-' + key}
                      rows={3}
                      readOnly={readonly}
                      aria-invalid={!!form.formState.errors[key]}
                      aria-describedby={
                        form.formState.errors[key]
                          ? 'client-' + key + '-error'
                          : undefined
                      }
                      {...form.register(key)}
                    />
                  ) : (
                    <input
                      id={'client-' + key}
                      type={type}
                      readOnly={readonly}
                      autoComplete="off"
                      dir={
                        key === 'email' || key === 'phone' ? 'ltr' : undefined
                      }
                      aria-invalid={!!form.formState.errors[key]}
                      aria-describedby={
                        form.formState.errors[key]
                          ? 'client-' + key + '-error'
                          : undefined
                      }
                      {...form.register(key)}
                    />
                  )}
                  {form.formState.errors[key] && (
                    <span
                      className="field-error"
                      id={'client-' + key + '-error'}
                    >
                      {t(form.formState.errors[key]?.message)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {message && (
          <div className="form-notice" role="alert">
            {t(message)}
          </div>
        )}
        {conflict && (
          <button
            type="button"
            className="text-button"
            disabled={pending}
            onClick={() => {
              void latest();
            }}
          >
            {t('تحميل آخر نسخة')}{' '}
          </button>
        )}
        <div className="client-dialog-footer">
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={onClose}
          >
            {readonly ? t('إغلاق') : t('إلغاء')}
          </button>
          {!readonly && (
            <button
              className={
                selection.archive
                  ? 'button button-archive'
                  : 'button button-primary'
              }
              type="submit"
              disabled={pending || uncertain || conflict}
            >
              {pending ? (
                <LoaderCircle className="spin" size={18} />
              ) : selection.archive ? (
                <Archive size={18} />
              ) : (
                <Users size={18} />
              )}
              {pending
                ? t('جارٍ الحفظ…')
                : selection.archive
                  ? t('تأكيد الأرشفة')
                  : client
                    ? t('حفظ التعديلات')
                    : t('إضافة العميل')}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
