'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { notificationsApi } from '../services/notifications-api';
import { notificationUpdatesFor } from '../services/notification-updates';
import {
  enableNotificationSound,
  playNotificationSound,
} from '../services/notification-sound';
import type { NotificationPage } from '../schemas/notifications';
const Context = createContext<{
  count: number | null;
  publish: (count: number | null) => void;
  observe: (page: NotificationPage) => void;
} | null>(null);
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { manager } = useSession();
  const [count, setCount] = useState<number | null>(null);
  const epoch = useRef(0);
  const countBlocked = useRef(false);
  const publish = useCallback((value: number | null) => {
    epoch.current++;
    countBlocked.current = value === null;
    setCount(value);
  }, []);
  const observe = useCallback(
    (page: NotificationPage) => {
      const snapshot = manager.getSnapshot();
      if (snapshot.status !== 'authenticated') return;
      const identity =
        snapshot.identity.workspace.id + ':' + snapshot.identity.user.id;
      if (notificationUpdatesFor(manager, identity)(page.items))
        playNotificationSound();
    },
    [manager],
  );
  useEffect(() => enableNotificationSound(), []);
  useEffect(() => {
    const controller = new AbortController(),
      generation = epoch.current;
    void manager
      .authorized((token) => notificationsApi.summary(token, controller.signal))
      .then((result) => {
        if (!controller.signal.aborted && epoch.current === generation)
          setCount(result.unreadCount);
      })
      .catch(() => {
        if (!controller.signal.aborted && epoch.current === generation)
          setCount(null);
      });
    return () => controller.abort();
  }, [manager]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll(initial = false) {
      const generation = epoch.current;
      try {
        const page = await manager.authorized((token) =>
          notificationsApi.list(token, 'all', null, controller.signal),
        );
        if (controller.signal.aborted) return;
        observe(page);
        if (!initial && !countBlocked.current && epoch.current === generation)
          setCount(page.unreadCount);
      } catch {
        // Preserve the current state and retry after transient network errors.
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void poll(), 15_000);
      }
    }
    void poll(true);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [manager, observe]);
  return (
    <Context.Provider value={{ count, publish, observe }}>
      {children}
    </Context.Provider>
  );
}
export function useNotificationCount() {
  const value = useContext(Context);
  if (!value) throw new Error('Notification provider missing');
  return value;
}
