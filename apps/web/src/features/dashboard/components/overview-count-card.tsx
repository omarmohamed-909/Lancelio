'use client';
import { useI18n } from '../../../i18n/language-provider';
import Link from 'next/link';
import {
  ArrowUpLeft,
  FileText,
  FolderKanban,
  Users,
  Wallet,
} from 'lucide-react';
export function OverviewCountCard({
  href,
  label,
  count,
  details,
}: {
  href: string;
  label: string;
  count: number;
  details: readonly { label: string; count: number }[];
}) {
  const { t, intlLocale } = useI18n();
  const Icon =
    href === '/clients'
      ? Users
      : href === '/proposals'
        ? FileText
        : href === '/projects'
          ? FolderKanban
          : Wallet;
  return (
    <article>
      <span className="overview-count-icon" aria-hidden="true">
        <Icon size={19} strokeWidth={1.7} />
      </span>
      <Link href={href}>
        <span>{t(label)}</span>
        <ArrowUpLeft size={17} aria-hidden="true" />
      </Link>
      <strong>{count.toLocaleString(intlLocale)}</strong>
      <dl className="overview-breakdown">
        {details.map((detail) => (
          <div key={detail.label}>
            <dt>{t(detail.label)}</dt>
            <dd>{detail.count.toLocaleString(intlLocale)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
