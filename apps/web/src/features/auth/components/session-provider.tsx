'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { SessionManager } from '../services/session-manager';

const SessionContext = createContext<SessionManager | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() => new SessionManager());
  useEffect(() => manager.connect(), [manager]);
  return (
    <SessionContext.Provider value={manager}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const manager = useContext(SessionContext);
  if (!manager) throw new Error('SessionProvider is required');
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getServerSnapshot,
  );
  return { manager, snapshot };
}
