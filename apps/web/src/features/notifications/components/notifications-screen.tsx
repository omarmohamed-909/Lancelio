'use client';
import { useI18n } from '../../../i18n/language-provider';

import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowUpLeft, Bell, Check, RefreshCw } from 'lucide-react';
import { WorkspaceShell } from '../../workspace/components/workspace-shell';
import { useSession } from '../../auth/components/session-provider';
import { useNotifications } from '../hooks/use-notifications';
import type { Notification } from '../schemas/notifications';
import { notificationLabels as labels } from '../utils/notification-labels';
export function NotificationsScreen() {
  const { snapshot } = useSession();
  return (
    <WorkspaceShell>
      {snapshot.status === 'authenticated' && (
        <Inbox
          key={snapshot.identity.workspace.id + ':' + snapshot.identity.user.id}
        />
      )}
    </WorkspaceShell>
  );
}
function NotificationRow({
  item,
  disabled,
  onChange,
}: {
  item: Notification;
  disabled: boolean;
  onChange: () => void;
}) {
  const { t, intlLocale } = useI18n();
  return (
    <article
      className={'notification-row' + (item.read ? ' is-read' : '')}
      aria-label={t(labels[item.kind]) + ': ' + item.title}
    >
      <span
        className="notification-status"
        role="img"
        aria-label={item.read ? t('مقروء') : t('غير مقروء')}
      >
        {item.read ? <Check size={16} aria-hidden="true" /> : <span />}
      </span>
      <div className="notification-copy">
        <span className="notification-kind">{t(labels[item.kind])}</span>
        <h2>{item.title}</h2>
        <time dateTime={item.occurredAt}>
          {new Intl.DateTimeFormat(intlLocale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(item.occurredAt))}
        </time>
        <Link
          href={
            (item.target.type === 'proposal' ? '/proposals/' : '/invoices/') +
            item.target.id
          }
        >
          {t('افتح')}{' '}
          {item.target.type === 'proposal' ? t('العرض') : t('الفاتورة')}
          <ArrowUpLeft size={16} aria-hidden="true" />
        </Link>
      </div>
      <button
        type="button"
        className="button button-secondary notification-read"
        disabled={disabled}
        onClick={onChange}
      >
        {item.read ? t('اعتبره غير مقروء') : t('علّم كمقروء')}
      </button>
    </article>
  );
}
function Inbox() {
  const { t, intlLocale } = useI18n();
  const { page, pending, error, notice, blocked, filter, reload, change } =
    useNotifications({ rememberFilter: true });
  const unreadFilter = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (notice && !pending && filter === 'unread')
      unreadFilter.current?.focus();
  }, [notice, pending, filter]);
  return (
    <section
      className="notification-inbox"
      aria-label={t('إشعارات مساحة العمل')}
      aria-busy={pending}
    >
      <div className="dashboard-heading">
        <div>
          <span className="form-eyebrow">{t('دفتر المستجدات')}</span>
          <h1>{t('الإشعارات')}</h1>
          <p>
            {t('ردود العملاء وإصدار الفواتير وحركة الدفعات، في مكان واحد.')}
          </p>
        </div>
        <button
          className="button button-secondary"
          disabled={pending}
          onClick={() => void reload()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {t('قراءة الإشعارات من جديد')}{' '}
        </button>
      </div>
      <div className="notification-filters" aria-label={t('عرض الإشعارات')}>
        <button
          className="button button-secondary"
          aria-pressed={filter === 'all'}
          disabled={pending}
          onClick={() => void reload('all')}
        >
          {t('الكل')}{' '}
        </button>
        <button
          className="button button-secondary"
          ref={unreadFilter}
          aria-pressed={filter === 'unread'}
          disabled={pending}
          onClick={() => void reload('unread')}
        >
          {t('غير المقروء')}{' '}
        </button>
        {page && (
          <span className="notification-total">
            {page.unreadCount.toLocaleString(intlLocale)} {t('غير مقروء')}{' '}
          </span>
        )}
      </div>
      <p className="notification-note">
        {t(
          'عدّاد الإشعارات بيتحدّث تلقائيًا كل ١٥ ثانية، والإشعار الجديد له صوت بعد أول ضغطة جوّه الموقع. القائمة تتحدث عند فتحها أو قراءتها من جديد. حالة القراءة تخصك أنت؛ فتح المستند وحده مش بيعلّم الإشعار كمقروء. تغيير حالة القراءة يرجع لأول صفحة.',
        )}{' '}
      </p>
      {pending && !page && (
        <LoadingPlaceholder label={t('بنقرأ مستجدات المساحة…')} />
      )}
      <p role="status" aria-live="polite" className="notification-note">
        {t(notice)}
      </p>
      {error && (
        <p className="form-notice" role="alert">
          {t(error)}
        </p>
      )}
      {blocked && (
        <p className="notification-note">
          {t('الكتابة متوقفة لحد ما تقرأ الحالة الحالية.')}{' '}
        </p>
      )}
      {page && (
        <>
          <p className="notification-asof">
            {t('آخر قراءة:')}{' '}
            <time dateTime={page.asOf}>
              {new Intl.DateTimeFormat(intlLocale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(page.asOf))}
            </time>
          </p>
          {page.items.length === 0 ? (
            <div className="notification-empty">
              <Bell size={24} aria-hidden="true" />
              <h2>
                {filter === 'unread' && page.unreadCount === 0
                  ? t('كل الإشعارات مقروءة')
                  : t('مفيش إشعارات في الصفحة دي')}
              </h2>
              <p>
                {filter === 'unread'
                  ? t('ارجع للكل لو حابب تراجع الأحداث السابقة.')
                  : t(
                      'أول رد على عرض أو إصدار فاتورة أو تسجيل دفعة هتلاقيه هنا.',
                    )}
              </p>
            </div>
          ) : (
            <div className="notification-list">
              {page.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  disabled={pending || blocked}
                  onChange={() => void change(item)}
                />
              ))}
            </div>
          )}
          <div className="notification-pagination">
            {page.nextCursor && (
              <button
                className="button button-secondary"
                disabled={pending}
                onClick={() => void reload(filter, page.nextCursor)}
              >
                {t('إشعارات أقدم')}{' '}
              </button>
            )}
            <button
              className="button button-secondary"
              disabled={pending}
              onClick={() => void reload(filter)}
            >
              {t('تحديث والرجوع لأول صفحة')}{' '}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
