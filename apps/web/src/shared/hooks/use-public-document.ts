'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/http-client';
function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
function tokenSnapshot() {
  return window.location.hash.slice(1);
}
function serverSnapshot(): null {
  return null;
}
export function usePublicDocumentLocation() {
  const token = useSyncExternalStore(subscribe, tokenSnapshot, serverSnapshot);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    function resume() {
      if (document.visibilityState === 'visible') reload();
    }
    function restored(event: PageTransitionEvent) {
      if (event.persisted) reload();
    }
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', restored);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', restored);
    };
  }, [reload]);
  return { token, revision, reload };
}
export function useGrantedDocument<T extends { validForSeconds: number }>(
  token: string,
  reload: () => void,
  read: (token: string, signal: AbortSignal) => Promise<T>,
) {
  const [data, setData] = useState<T | null>(null),
    [failure, setFailure] = useState<'unavailable' | 'network' | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    void read(token, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        expiry = setTimeout(
          reload,
          Math.min(result.validForSeconds * 1000, 2147000000),
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setFailure(
            cause instanceof ApiError && cause.status === 404
              ? 'unavailable'
              : 'network',
          );
      });
    return () => {
      controller.abort();
      clearTimeout(expiry);
    };
  }, [token, reload, read]);
  return { data, setData, failure };
}
