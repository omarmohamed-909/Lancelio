'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { SetStateAction } from 'react';
import type { z } from 'zod';
import { useSession } from '../../auth/components/session-provider';

const memory = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
const serverSnapshot = () => null;

function read(key: string | null): string | null {
  if (!key) return null;
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null, schema: z.ZodType<T>, fallback: T): T {
  if (raw === null) return fallback;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

// Only validated view preferences are saved; rows, credentials and cursors stay out.
export function useListPreferences<T>(
  name: string,
  schema: z.ZodType<T>,
  defaults: T,
  enabled = true,
) {
  const { snapshot } = useSession();
  const key =
    enabled && snapshot.status === 'authenticated'
      ? `lancelio:list:v1:${snapshot.identity.user.id}:${snapshot.identity.workspace.id}:${name}`
      : null;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!key) return () => {};
      const group = listeners.get(key) ?? new Set<() => void>();
      group.add(notify);
      listeners.set(key, group);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) {
          memory.delete(key);
          notify();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        group.delete(notify);
        if (group.size === 0) listeners.delete(key);
        window.removeEventListener('storage', onStorage);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => read(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const value = useMemo(
    () => parse(raw, schema, defaults),
    [raw, schema, defaults],
  );
  const setValue = useCallback(
    (update: SetStateAction<T>) => {
      if (!key) return;
      const previous = parse(read(key), schema, defaults);
      const next =
        typeof update === 'function'
          ? (update as (previous: T) => T)(previous)
          : update;
      const result = schema.safeParse(next);
      if (!result.success) return;
      const serialized = JSON.stringify(result.data);
      try {
        window.localStorage.setItem(key, serialized);
        memory.delete(key);
      } catch {
        // A blocked or full browser store still allows navigation in this tab.
        memory.set(key, serialized);
      }
      listeners.get(key)?.forEach((notify) => notify());
    },
    [key, schema, defaults],
  );
  return [value, setValue] as const;
}
