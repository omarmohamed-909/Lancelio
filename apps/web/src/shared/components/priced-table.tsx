'use client';
import { useI18n } from '../../i18n/language-provider';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
export function PricedTable({
  children,
  label = 'بنود العرض، جدول قابل للتمرير',
}: {
  children: ReactNode;
  label?: string;
}) {
  const { t } = useI18n();
  const region = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const element = region.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (active) setScrollable(element.scrollWidth > element.clientWidth + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);
  return (
    <>
      <div
        ref={region}
        className="proposal-table-wrap"
        tabIndex={scrollable ? 0 : undefined}
        role={scrollable ? 'region' : undefined}
        aria-label={scrollable ? t(label) : undefined}
        aria-describedby={scrollable ? hintId : undefined}
      >
        {children}
      </div>
      {scrollable && (
        <p id={hintId} className="proposal-table-hint">
          {t(
            'حرّك الجدول أفقيًا لمراجعة كل الأسعار. تقدر تستخدم أسهم الكيبورد كمان.',
          )}{' '}
        </p>
      )}
    </>
  );
}
