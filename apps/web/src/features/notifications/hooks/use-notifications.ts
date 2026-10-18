'use client';
import { z } from 'zod';
import { useListPreferences } from '../../workspace/hooks/use-list-preferences';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { useNotificationCount } from '../components/notification-provider';
import {
  notificationsApi,
  notificationError,
} from '../services/notifications-api';
import type { Notification, NotificationPage } from '../schemas/notifications';
const preferencesSchema = z.object({ filter: z.enum(['all', 'unread']) });
const defaults = { filter: 'all' as const };
export function useNotifications({
  preserveCountWhileLoading = false,
  rememberFilter = false,
} = {}) {
  const [preferences, savePreferences] = useListPreferences(
    'notifications',
    preferencesSchema,
    defaults,
    rememberFilter,
  );
  const [initialFilter] = useState(() =>
    rememberFilter ? preferences.filter : 'all',
  );
  const { manager } = useSession(),
    { publish, observe } = useNotificationCount();
  const [page, setPage] = useState<NotificationPage | null>(null),
    [pending, setPending] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [blocked, setBlocked] = useState(false),
    [filter, setFilter] = useState<'all' | 'unread'>(initialFilter);
  const lifetime = useRef<AbortController | null>(null),
    busy = useRef(false),
    stop = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    busy.current = true;
    if (!preserveCountWhileLoading) publish(null);
    void manager
      .authorized((token) =>
        notificationsApi.list(token, initialFilter, null, controller.signal),
      )
      .then((result) => {
        if (!controller.signal.aborted) {
          setPage(result);
          publish(result.unreadCount);
          if (initialFilter === 'all') observe(result);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(notificationError(cause));
          publish(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          busy.current = false;
          setPending(false);
        }
      });
    return () => controller.abort();
  }, [manager, publish, observe, preserveCountWhileLoading, initialFilter]);
  async function reload(nextFilter = filter, cursor: string | null = null) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setNotice('');
    setPage(null);
    publish(null);
    setFilter(nextFilter);
    if (rememberFilter) savePreferences({ filter: nextFilter });
    try {
      const fresh = await manager.authorized((token) =>
        notificationsApi.list(token, nextFilter, cursor, controller.signal),
      );
      if (!controller.signal.aborted) {
        setPage(fresh);
        publish(fresh.unreadCount);
        if (nextFilter === 'all' && cursor === null) observe(fresh);
        stop.current = false;
        setBlocked(false);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(notificationError(cause));
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function change(item: Notification) {
    const controller = lifetime.current;
    if (
      !controller ||
      controller.signal.aborted ||
      busy.current ||
      stop.current
    )
      return;
    busy.current = true;
    setPending(true);
    setError('');
    setNotice('');
    try {
      await manager.authorized((token) =>
        notificationsApi.setRead(
          token,
          item.id,
          item.version,
          !item.read,
          controller.signal,
        ),
      );
      // Read the authoritative count and first page after saving. New events or
      // another tab's read changes must not be hidden by a local counter delta.
      const fresh = await manager.authorized((token) =>
        notificationsApi.list(token, filter, null, controller.signal),
      );
      if (!controller.signal.aborted) {
        setPage(fresh);
        publish(fresh.unreadCount);
        if (filter === 'all') observe(fresh);
        setNotice(
          item.read ? 'الإشعار بقى غير مقروء.' : 'الإشعار اتعلّم كمقروء.',
        );
      }
    } catch {
      if (!controller.signal.aborted) {
        stop.current = true;
        setBlocked(true);
        setPage(null);
        publish(null);
        setError(
          'نتيجة تغيير حالة القراءة محتاجة مراجعة. اقرأ القائمة من جديد قبل أي تغيير تاني.',
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return { page, pending, error, notice, blocked, filter, reload, change };
}
