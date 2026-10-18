'use client';
import { useI18n } from '../../i18n/language-provider';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CircleCheck, ShieldQuestion, X } from 'lucide-react';
import { answerConfirmation, dismissSuccess, feedbackStore } from './feedback';

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const toastElement = useRef<HTMLDivElement>(null);
  const { confirmation, toast } = useSyncExternalStore(
    feedbackStore.subscribe,
    feedbackStore.snapshot,
    feedbackStore.serverSnapshot,
  );
  const pathname = usePathname();
  useEffect(() => {
    answerConfirmation(false);
    if (pathname === '/login' && feedbackStore.snapshot().toast)
      dismissSuccess(feedbackStore.snapshot().toast!.id);
  }, [pathname]);
  useEffect(() => {
    const element = toastElement.current;
    if (!toast || !element) return;
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => clearTimeout(timer);
    const resume = () => {
      stop();
      if (
        element.isConnected &&
        !element.contains(document.activeElement) &&
        !element.matches(':hover')
      )
        timer = setTimeout(() => dismissSuccess(toast.id), 7000);
    };
    const leaveFocus = () => queueMicrotask(resume);
    resume();
    element.addEventListener('pointerenter', stop);
    element.addEventListener('pointerleave', resume);
    element.addEventListener('focusin', stop);
    element.addEventListener('focusout', leaveFocus);
    return () => {
      stop();
      element.removeEventListener('pointerenter', stop);
      element.removeEventListener('pointerleave', resume);
      element.removeEventListener('focusin', stop);
      element.removeEventListener('focusout', leaveFocus);
    };
  }, [toast]);
  return (
    <>
      {children}
      {confirmation && <ConfirmationDialog message={confirmation.message} />}
      {toast && (
        <div
          ref={toastElement}
          className="success-toast"
          role="region"
          aria-label={t('آخر عملية ناجحة')}
          key={toast.id}
        >
          <CircleCheck size={22} aria-hidden="true" />
          <p role={toast.announce ? 'status' : undefined}>{t(toast.message)}</p>
          <button
            type="button"
            className="icon-button"
            aria-label={t('إغلاق رسالة النجاح')}
            onClick={() => dismissSuccess(toast.id)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

function ConfirmationDialog({ message }: { message: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirmation-dialog"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-message"
      onCancel={(event) => {
        event.preventDefault();
        answerConfirmation(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons =
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <span className="confirmation-icon">
        <ShieldQuestion size={26} aria-hidden="true" />
      </span>
      <h2 id="confirmation-title">{t('نكمّل الخطوة دي؟')}</h2>
      <p id="confirmation-message">{t(message)}</p>
      <div className="confirmation-actions">
        <button
          ref={cancel}
          type="button"
          className="button button-secondary"
          onClick={() => answerConfirmation(false)}
        >
          {t('رجوع')}{' '}
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => answerConfirmation(true)}
        >
          {t('تأكيد')}{' '}
        </button>
      </div>
    </dialog>
  );
}
