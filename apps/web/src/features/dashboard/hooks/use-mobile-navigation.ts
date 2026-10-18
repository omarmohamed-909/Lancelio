import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

const focusableSelector =
  'a[href], button:not(:disabled), select:not(:disabled), [tabindex="0"]';
const mobileQuery = '(max-width: 760px)';
const getViewport = () => window.matchMedia(mobileQuery).matches;
const getServerViewport = () => false;

export function useMobileNavigation(open: boolean, close: () => void) {
  const subscribeViewport = useCallback(
    (listener: () => void) => {
      const media = window.matchMedia(mobileQuery);
      const onChange = () => {
        // Close before notifying React so viewport cleanup cannot skip dismissal.
        if (!media.matches) close();
        listener();
      };
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [close],
  );
  const isMobile = useSyncExternalStore(
    subscribeViewport,
    getViewport,
    getServerViewport,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !isMobile) return;
    const sidebar = sidebarRef.current;
    const trigger = triggerRef.current;
    if (!sidebar) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar
      .querySelector<HTMLButtonElement>('[data-nav-close]')
      ?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !sidebar) return;
      const controls = Array.from(
        sidebar.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (trigger?.getClientRects().length)
        trigger.focus({ preventScroll: true });
      else {
        const destination =
          sidebar.querySelector<HTMLAnchorElement>('[aria-current="page"]') ??
          sidebar.querySelector<HTMLAnchorElement>('nav a[href]');
        destination?.focus({ preventScroll: true });
      }
    };
  }, [open, close, isMobile]);
  return { sidebarRef, triggerRef, isMobile };
}
