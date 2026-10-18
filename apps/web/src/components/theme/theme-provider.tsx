'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
const storageKey = 'lancelio:theme:v1';
const listeners = new Set<() => void>();
let temporary: ThemePreference | undefined;
const serverSnapshot = () => 'system' as const;

function preference(): ThemePreference {
  if (temporary) return temporary;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    /* The current-tab choice remains usable when storage is blocked. */
  }
  return 'system';
}

function apply() {
  const value = preference();
  document.documentElement.dataset.theme =
    value === 'dark' ||
    (value === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light';
}

function publish() {
  apply();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTheme(value: ThemePreference) {
  try {
    window.localStorage.setItem(storageKey, value);
    temporary = undefined;
  } catch {
    temporary = value;
  }
  publish();
}

export function useTheme() {
  const value = useSyncExternalStore(subscribe, preference, serverSnapshot);
  const resolved = useSyncExternalStore(
    subscribe,
    () =>
      document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    () => 'light',
  );
  return { preference: value, resolved, setTheme };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      temporary = undefined;
      publish();
    };
    publish();
    media.addEventListener('change', publish);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', publish);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return children;
}
