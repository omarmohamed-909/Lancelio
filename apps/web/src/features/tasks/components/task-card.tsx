'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { taskStatuses, taskPriorities } from '../schemas/task';
import type { Task, TaskStatus } from '../schemas/task';
export function TaskCard({
  task,
  lane,
  allTasks,
  readonly,
  pending,
  onEdit,
  onDelete,
  onVisibility,
  onMove,
}: {
  task: Task;
  lane: Task[];
  allTasks: Task[];
  readonly: boolean;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onVisibility: () => void;
  onMove: (
    id: string,
    status: TaskStatus,
    before: string | null,
  ) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [moving, setMoving] = useState(false),
    [status, setStatus] = useState<TaskStatus>(task.status),
    [anchor, setAnchor] = useState('');
  const trigger = useRef<HTMLButtonElement>(null),
    destination = useRef<HTMLButtonElement>(null),
    restore = useRef(false);
  useEffect(() => {
    if (moving) destination.current?.focus();
    else if (restore.current) {
      trigger.current?.focus();
      restore.current = false;
    }
  }, [moving, pending]);
  function close() {
    restore.current = true;
    setMoving(false);
  }
  const index = lane.findIndex((item) => item.id === task.id);
  return (
    <li className="task-card" data-task-id={task.id}>
      <div className="task-card-heading">
        <h4>{task.title}</h4>
        <span className="task-priority" data-priority={task.priority}>
          {t(taskPriorities[task.priority])}
        </span>
      </div>
      <p className="task-visibility" data-client-visible={task.clientVisible}>
        {task.clientVisible ? t('مسموح عرضها للعميل') : t('خاصة بمساحتك')}
      </p>
      {task.description && (
        <p className="task-description">{task.description}</p>
      )}
      {!readonly && (
        <fieldset disabled={pending} className="task-card-controls">
          <div className="task-card-actions">
            <button
              className="proposal-text-button"
              onClick={(event) => {
                event.currentTarget.focus();
                onEdit();
              }}
            >
              {t('تعديل')}{' '}
            </button>
            <button
              className="proposal-text-button"
              ref={trigger}
              onClick={() => {
                setStatus(task.status);
                setAnchor('');
                setMoving(true);
              }}
            >
              {t('نقل وترتيب')}{' '}
            </button>
            <button
              className="proposal-text-button"
              onClick={(event) => {
                event.currentTarget.focus();
                onDelete();
              }}
            >
              {t('حذف')}{' '}
            </button>
            <button
              className="proposal-text-button"
              onClick={(event) => {
                event.currentTarget.focus();
                onVisibility();
              }}
            >
              {task.clientVisible ? t('إخفاء عن العميل') : t('السماح بعرضها')}
            </button>
            <div className="task-order-buttons">
              <button
                className="icon-button"
                aria-label={t('طلّع مهمة ') + task.title}
                disabled={index === 0}
                onClick={() =>
                  void onMove(task.id, task.status, lane[index - 1]?.id ?? null)
                }
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={t('نزّل مهمة ') + task.title}
                disabled={index === lane.length - 1}
                onClick={() =>
                  void onMove(task.id, task.status, lane[index + 2]?.id ?? null)
                }
              >
                <ArrowDown size={16} />
              </button>
            </div>
          </div>
          {moving && (
            <div
              className="task-move-controls"
              role="group"
              aria-label={t('نقل مهمة ') + task.title}
            >
              <div>
                <label htmlFor={'task-destination-' + task.id}>
                  {t('نقل المهمة إلى')}{' '}
                </label>
                <Select
                  ref={destination}
                  id={'task-destination-' + task.id}
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value as TaskStatus);
                    setAnchor('');
                  }}
                >
                  {Object.entries(taskStatuses).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor={'task-anchor-' + task.id}>
                  {t('مكان المهمة')}
                </label>
                <Select
                  id={'task-anchor-' + task.id}
                  value={anchor}
                  onValueChange={(value) => setAnchor(value)}
                >
                  <option value="">{t('آخر القائمة')}</option>
                  {allTasks
                    .filter(
                      (item) => item.status === status && item.id !== task.id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {t('قبل ') + item.title}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="task-move-actions">
                <button
                  className="button button-secondary"
                  onClick={() =>
                    void onMove(task.id, status, anchor || null).then(
                      (saved) => {
                        if (saved) close();
                      },
                    )
                  }
                >
                  {t('تطبيق النقل')}{' '}
                </button>
                <button className="proposal-text-button" onClick={close}>
                  {t('رجوع')}{' '}
                </button>
              </div>
            </div>
          )}
        </fieldset>
      )}
    </li>
  );
}
