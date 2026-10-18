'use client';
import { useI18n } from '../../i18n/language-provider';

import type { MouseEvent } from 'react';
export function SkipLink() {
  const { t } = useI18n();
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById('main-content');
    if (!target) return;
    event.preventDefault();
    target.tabIndex = -1;
    target.focus();
    target.scrollIntoView({ block: 'start' });
  }
  return (
    <a className="skip-link" href="#main-content" onClick={skip}>
      {t('انتقل للمحتوى')}{' '}
    </a>
  );
}
