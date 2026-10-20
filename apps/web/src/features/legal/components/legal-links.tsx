'use client';

import Link from 'next/link';
import { useI18n } from '../../../i18n/language-provider';
import './legal-links.css';

export const legalLinks = [
  { id: 'privacy', label: 'سياسة الخصوصية' },
  { id: 'terms', label: 'شروط الاستخدام' },
  { id: 'cookies', label: 'ملفات الارتباط والتفضيلات' },
] as const;

export function LegalLinks() {
  const { t } = useI18n();
  return (
    <nav className="legal-links" aria-label={t('المعلومات القانونية')}>
      {legalLinks.map(({ id, label }) => (
        <Link key={id} href={`/${id}`}>
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}
