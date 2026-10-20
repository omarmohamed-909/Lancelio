'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useLandingMotion(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const surface = root.current;
    if (!surface || !('IntersectionObserver' in window)) return;
    const regions = Array.from(
      surface.querySelectorAll<HTMLElement>('[data-land-motion]'),
    );
    const visible = new Set<Element>();
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const synchronize = () => {
      for (const region of regions)
        region.dataset.motionActive = String(
          visible.has(region) && !document.hidden && !preference.matches,
        );
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        synchronize();
      },
      { threshold: 0 },
    );
    regions.forEach((region) => observer.observe(region));
    preference.addEventListener('change', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
    };
  }, [root]);
}
