'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { readDashboard } from '../services/dashboard-api';
import type { WorkspaceOverview } from '../schemas/workspace-overview';
export function useWorkspaceOverview() {
  const { manager } = useSession();
  const [data, setData] = useState<WorkspaceOverview | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    busy.current = true;
    void manager
      .authorized((token) => readDashboard(token, controller.signal))
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('تعذر تحميل أرقام المساحة. حاول مرة تانية.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          busy.current = false;
          setPending(false);
        }
      });
    return () => controller.abort();
  }, [manager]);
  async function reload() {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setData(null);
    try {
      const fresh = await manager.authorized((token) =>
        readDashboard(token, controller.signal),
      );
      if (!controller.signal.aborted) setData(fresh);
    } catch {
      if (!controller.signal.aborted)
        setError('تعذر تحميل أرقام المساحة. حاول مرة تانية.');
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return { data, pending, error, reload };
}
