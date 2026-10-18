'use client';
import { useLayoutEffect } from 'react';
import { confirmAction } from '../../components/ui/feedback';

const dirtySections = new Set<symbol>();
let removeGuard: (() => void) | undefined;

function installGuard(warning: string) {
  let active = true;
  let pending = false;
  let replay: Element | null = null;
  let allowBack = false;
  let approvedTraversal: string | null = null;
  const unload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  const click = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    )
      return;
    const anchor = event.target.closest('a');
    const exit = event.target.closest('[data-leaves-page]');
    if (replay && (anchor === replay || exit === replay)) {
      replay = null;
      return;
    }
    if (anchor) {
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
    }
    const target = anchor || exit;
    if (target instanceof HTMLElement) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (pending) return;
      pending = true;
      void confirmAction(warning).then((accepted) => {
        pending = false;
        if (accepted && active && target.isConnected) {
          replay = target;
          target.click();
        }
      });
    }
  };
  const current = {
    url: window.location.href,
    state: window.history.state as unknown,
  };
  const back = (event: PopStateEvent) => {
    if (allowBack) {
      allowBack = false;
      return;
    }
    if (window.location.href === current.url) return;
    event.stopImmediatePropagation();
    window.history.pushState(current.state, '', current.url);
    if (pending) return;
    pending = true;
    void confirmAction(warning).then((accepted) => {
      pending = false;
      if (accepted && active) {
        allowBack = true;
        window.history.back();
      }
    });
  };
  // Intercept traversal before the browser commits it where the Navigation API
  // is available; popstate remains the fallback for other browsers.
  const navigation = window.navigation;
  const navigate = (event: NavigateEvent) => {
    if (
      event.navigationType !== 'traverse' ||
      !event.destination.sameDocument ||
      !event.cancelable ||
      !event.canIntercept
    )
      return;
    const key = event.destination.key;
    if (approvedTraversal === key) {
      approvedTraversal = null;
      allowBack = true;
      return;
    }
    if (event.destination.url === current.url) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    void confirmAction(warning).then((accepted) => {
      pending = false;
      if (!accepted || !active) return;
      approvedTraversal = key;
      void navigation.traverseTo(key).finished?.catch(() => {
        approvedTraversal = null;
        allowBack = false;
      });
    });
  };
  navigation?.addEventListener('navigate', navigate);
  window.addEventListener('beforeunload', unload);
  window.addEventListener('popstate', back, true);
  document.addEventListener('click', click, true);
  return () => {
    active = false;
    window.removeEventListener('beforeunload', unload);
    window.removeEventListener('popstate', back, true);
    document.removeEventListener('click', click, true);
    navigation?.removeEventListener('navigate', navigate);
  };
}

export function useUnsavedChanges(
  dirty: boolean,
  warning = 'تخرج من غير حفظ التغييرات؟',
) {
  useLayoutEffect(() => {
    if (!dirty) return;
    const section = Symbol();
    dirtySections.add(section);
    removeGuard ??= installGuard(warning);
    return () => {
      dirtySections.delete(section);
      if (dirtySections.size === 0) {
        removeGuard?.();
        removeGuard = undefined;
      }
    };
  }, [dirty, warning]);
}
