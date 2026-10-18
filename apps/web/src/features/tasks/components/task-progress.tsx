'use client';
import { useI18n } from '../../../i18n/language-provider';
import type { TaskProgress as Progress } from '../schemas/task';
export function TaskProgress({
  progress,
  label,
}: {
  progress: Progress;
  label: string;
}) {
  const { t, intlLocale } = useI18n();
  const number = new Intl.NumberFormat(intlLocale);
  return (
    <section className="task-progress" aria-label={t(label)}>
      <div className="task-progress-heading">
        <h3>{t(label)}</h3>
        {progress.percentage !== null && (
          <strong>
            {number.format(progress.percentage)}
            {t('٪')}
          </strong>
        )}
      </div>
      {progress.percentage === null ? (
        <p>{t('التقدم لسه مش محسوب؛ مفيش مهام.')}</p>
      ) : (
        <>
          <progress
            max={100}
            value={progress.percentage}
            aria-label={t(label)}
          />
          <p>
            {number.format(progress.done)} {t('من')}{' '}
            {number.format(progress.total)} {t('مهمة خلصت.')}{' '}
          </p>
        </>
      )}
    </section>
  );
}
