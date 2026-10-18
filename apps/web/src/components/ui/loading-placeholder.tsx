'use client';
import { useI18n } from '../../i18n/language-provider';
export function LoadingPlaceholder({
  label,
  kind = 'list',
  count = 3,
}: {
  label: string;
  kind?: 'list' | 'overview' | 'form';
  count?: number;
}) {
  const { t } = useI18n();
  return (
    <div
      className={'loading-placeholder loading-placeholder-' + kind}
      role="status"
      aria-label={t(label)}
    >
      <span className="visually-hidden">{t(label)}</span>
      <div className="loading-placeholder-items" aria-hidden="true">
        {Array.from({ length: kind === 'overview' ? 4 : count }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <span className="skeleton-block skeleton-icon" />
            <span className="skeleton-block skeleton-title" />
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line skeleton-short" />
          </div>
        ))}
      </div>
    </div>
  );
}
