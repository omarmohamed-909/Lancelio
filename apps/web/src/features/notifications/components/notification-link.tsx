'use client';
import { useI18n } from '../../../i18n/language-provider';

import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpLeft, Bell, Check, RefreshCw, X } from 'lucide-react';
import { useNotificationCount } from './notification-provider';
import { useNotifications } from '../hooks/use-notifications';
import { notificationLabels } from '../utils/notification-labels';

export function NotificationLink() {
  const pathname = usePathname();
  return <NotificationPopover key={pathname} />;
}

function NotificationPopover() {
  const { t, intlLocale } = useI18n();
  const { count } = useNotificationCount();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div
      className="notification-popover"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="notification-link"
        aria-label={
          t('افتح الإشعارات، ') +
          (count === null
            ? t('العدد غير متاح')
            : count.toLocaleString(intlLocale) + t(' غير مقروء'))
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'notification-preview' : undefined}
        title={t('الإشعارات')}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={19} aria-hidden="true" />
        {count !== null && count > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {count > 99 ? t('٩٩+') : count.toLocaleString(intlLocale)}
          </span>
        )}
      </button>
      {open && (
        <NotificationPreview
          close={() => setOpen(false)}
          restoreFocus={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function NotificationPreview({
  close,
  restoreFocus,
}: {
  close: () => void;
  restoreFocus: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const { page, pending, error, notice, reload, change } = useNotifications({
    preserveCountWhileLoading: true,
  });
  const closeButton = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(() => closeButton.current?.focus(), []);
  useEffect(() => {
    if (error) retryButton.current?.focus();
  }, [error]);

  return (
    <section
      id="notification-preview"
      className="notification-preview"
      role="dialog"
      aria-labelledby="notification-preview-title"
    >
      <div className="notification-preview-heading">
        <div>
          <h2 id="notification-preview-title">{t('الإشعارات')}</h2>
          <p>
            {page
              ? page.unreadCount.toLocaleString(intlLocale) + t(' غير مقروء')
              : t('آخر مستجدات شغلك')}
          </p>
        </div>
        <button
          ref={closeButton}
          type="button"
          className="icon-button"
          aria-label={t('إغلاق الإشعارات')}
          onClick={restoreFocus}
        >
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <div className="notification-preview-body" aria-busy={pending}>
        {pending && !page && (
          <LoadingPlaceholder label={t('بنقرأ مستجداتك…')} count={3} />
        )}
        {error && (
          <div className="notification-preview-state">
            <p role="alert">{t(error)}</p>
            <button
              ref={retryButton}
              className="button button-secondary"
              disabled={pending}
              onClick={() => void reload()}
            >
              <RefreshCw size={16} aria-hidden="true" /> {t('حاول تاني')}{' '}
            </button>
          </div>
        )}
        {page?.items.length === 0 && (
          <div className="notification-preview-state">
            <span className="notification-preview-empty-icon">
              <Bell size={24} aria-hidden="true" />
            </span>
            <h3>{t('مفيش إشعارات جديدة لسه')}</h3>
            <p>{t('ردود العملاء والفواتير والدفعات هتظهر هنا.')}</p>
          </div>
        )}
        {page && page.items.length > 0 && (
          <ul className="notification-preview-list">
            {page.items.slice(0, 6).map((item) => (
              <li key={item.id} className={item.read ? 'is-read' : undefined}>
                <span className="notification-preview-dot" aria-hidden="true" />
                <div>
                  <span className="notification-kind">
                    {t(notificationLabels[item.kind])}
                  </span>
                  <Link
                    href={
                      (item.target.type === 'proposal'
                        ? '/proposals/'
                        : '/invoices/') + item.target.id
                    }
                    onClick={close}
                  >
                    {item.title}
                  </Link>
                  <time dateTime={item.occurredAt}>
                    {new Intl.DateTimeFormat(intlLocale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(item.occurredAt))}
                  </time>
                  <button
                    className="notification-preview-read"
                    type="button"
                    aria-disabled={pending}
                    onClick={() => {
                      if (!pending) void change(item);
                    }}
                  >
                    <Check size={15} aria-hidden="true" />
                    {item.read ? t('اعتبره غير مقروء') : t('علّم كمقروء')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p
          className="notification-preview-notice"
          role="status"
          aria-live="polite"
        >
          {t(notice)}
        </p>
      </div>
      <div className="notification-preview-footer">
        <Link href="/connections" onClick={close}>
          {t('دعوات في انتظارك')} <ArrowUpLeft size={17} aria-hidden="true" />
        </Link>
        <Link href="/notifications" onClick={close}>
          {t('عرض كل الإشعارات')} <ArrowUpLeft size={17} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
