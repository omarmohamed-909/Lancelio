'use client';
import { useI18n } from '../../../i18n/language-provider';
import { taskStatuses } from '../schemas/task';
import type { ClientTaskView } from '../schemas/task';
import { TaskProgress } from './task-progress';
export function ClientTaskPreview({ view }: { view: ClientTaskView }) {
  const { t } = useI18n();
  return (
    <details className="task-client-preview">
      <summary>{t('معاينة المهام المسموح عرضها للعميل')}</summary>
      <div className="task-client-preview-content">
        <p className="proposal-footnote">
          {t(
            'دي معاينة عندك فقط. بوابة متابعة العميل لسه مش متاحة، ومفيش رابط مشروع مشارَك حاليًا.',
          )}{' '}
        </p>
        <TaskProgress
          progress={view.progress}
          label={t('تقدم مهام متابعة العميل')}
        />
        {view.tasks.length === 0 ? (
          <p className="task-preview-empty">
            {t('مفيش مهام مسموح عرضها للعميل.')}
          </p>
        ) : (
          <ol>
            {view.tasks.map((task, index) => (
              <li key={index}>
                <div>
                  <h4>{task.title}</h4>
                  <span>{t(taskStatuses[task.status])}</span>
                </div>
                {task.description && <p>{task.description}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
