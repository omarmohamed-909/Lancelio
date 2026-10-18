'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// Content stays visible without JavaScript. Reveal each surface once per route,
// including surfaces mounted after an API read, without remounting forms.
export function ViewportMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const surface = root.current;
    if (!surface) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet<Element>();
    const targets = new Set<HTMLElement>();
    const selector = [
      '.overview-counts article',
      '.overview-task-line',
      '.overview-finances',
      '.overview-deadlines',
      '.module-card',
      '.account-panel',
      '.client-book',
      '.proposal-book',
      '.proposal-paper',
      '.proposal-tally',
      '.task-card',
    ].join(',');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          if (!preference.matches) {
            const target = entry.target as HTMLElement;
            target.dataset.viewportEntered = 'true';
            targets.add(target);
          }
        });
      },
      { threshold: 0.08 },
    );
    const discover = () => {
      surface.querySelectorAll<HTMLElement>(selector).forEach((target) => {
        if (seen.has(target)) return;
        seen.add(target);
        observer.observe(target);
      });
    };
    const reduce = () => {
      if (preference.matches) {
        targets.forEach((target) => delete target.dataset.viewportEntered);
        targets.clear();
      }
    };
    discover();
    const mutations = new MutationObserver(discover);
    mutations.observe(surface, { childList: true, subtree: true });
    preference.addEventListener('change', reduce);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      preference.removeEventListener('change', reduce);
      targets.forEach((target) => delete target.dataset.viewportEntered);
    };
  }, [pathname]);

  return (
    <div ref={root} className="viewport-motion">
      {children}
    </div>
  );
}
