'use client';
import { useI18n } from '../../../i18n/language-provider';

import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { useTaskBoard } from '../hooks/use-task-board';
import { taskApi } from '../services/task-api';
import { taskStatuses } from '../schemas/task';
import type { TaskInput, TaskStatus } from '../schemas/task';
import { TaskEditor } from './task-editor';
import type { TaskSelection } from './task-editor';
import { TaskCard } from './task-card';
import { TaskProgress } from './task-progress';
import { ClientTaskPreview } from './client-task-preview';
export function ProjectTasks({
  projectId,
  projectStatus,
  onProjectRefresh,
}: {
  projectId: string;
  projectStatus: 'active' | 'on_hold' | 'completed' | 'cancelled';
  onProjectRefresh: () => void;
}) {
  const { snapshot } = useSession();
  if (snapshot.status !== 'authenticated') return null;
  return (
    <TaskBoard
      key={snapshot.identity.workspace.id + ':' + projectId}
      projectId={projectId}
      projectStatus={projectStatus}
      onProjectRefresh={onProjectRefresh}
    />
  );
}
function TaskBoard({
  projectId,
  projectStatus,
  onProjectRefresh,
}: {
  projectId: string;
  projectStatus: 'active' | 'on_hold' | 'completed' | 'cancelled';
  onProjectRefresh: () => void;
}) {
  const { t, countText, intlLocale } = useI18n();
  const state = useTaskBoard(projectId),
    [selection, setSelection] = useState<TaskSelection | null>(null);
  useEffect(() => {
    if (state.board && state.board.projectStatus !== projectStatus)
      onProjectRefresh();
  }, [state.board, projectStatus, onProjectRefresh]);
  const failure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error && !selection) failure.current?.focus();
  }, [state.error, selection]);
  const add = useRef<HTMLButtonElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const readonly =
    state.board?.projectStatus === 'completed' ||
    state.board?.projectStatus === 'cancelled';
  async function save(input: TaskInput) {
    if (!selection) return false;
    return state.write(
      (token, version, signal) =>
        selection.kind === 'create'
          ? taskApi.create(token, projectId, version, input, signal)
          : selection.kind === 'edit'
            ? taskApi.update(
                token,
                projectId,
                selection.task.id,
                version,
                input,
                signal,
              )
            : selection.kind === 'visibility'
              ? taskApi.setVisibility(
                  token,
                  projectId,
                  selection.task.id,
                  version,
                  !selection.task.clientVisible,
                  signal,
                )
              : taskApi.remove(
                  token,
                  projectId,
                  selection.task.id,
                  version,
                  signal,
                ),
      selection.kind === 'create'
        ? t('المهمة اتضافت.')
        : selection.kind === 'edit'
          ? t('تغييرات المهمة اتحفظت.')
          : selection.kind === 'visibility'
            ? t('اختيار ظهور المهمة اتحفظ.')
            : t('المهمة اتحذفت.'),
    );
  }
  async function move(id: string, status: TaskStatus, before: string | null) {
    const saved = await state.write(
      (token, version, signal) =>
        taskApi.move(token, projectId, id, version, status, before, signal),
      t('حالة المهمة وترتيبها اتحفظوا.'),
    );
    if (saved) heading.current?.focus();
    return saved;
  }
  async function reload() {
    const loaded = await state.reload();
    if (loaded) heading.current?.focus();
    return loaded;
  }
  return (
    <section
      className="task-board"
      aria-labelledby="task-board-heading"
      aria-busy={state.pending}
    >
      <div className="task-board-heading">
        <div>
          <span className="form-eyebrow">{t('خطوات الشغل')}</span>
          <h2 id="task-board-heading" ref={heading} tabIndex={-1}>
            {t('مهام المشروع')}{' '}
          </h2>
          <p>{t('حوّل نطاق الشغل لخطوات واضحة.')}</p>
        </div>
        <div className="task-board-tools">
          <button
            className="icon-button"
            aria-label={t('تحديث مهام المشروع')}
            disabled={state.pending || selection !== null}
            onClick={() => void reload()}
          >
            <RefreshCw size={18} />
          </button>
          {state.board && !readonly && (
            <button
              className="button button-primary"
              ref={add}
              disabled={
                state.pending ||
                state.blocked ||
                state.board.tasks.length >= 200
              }
              onClick={(event) => {
                event.currentTarget.focus();
                setSelection({ kind: 'create' });
              }}
            >
              <Plus size={17} />
              {t('مهمة جديدة')}{' '}
            </button>
          )}
        </div>
      </div>
      <p className="task-notice" role="status">
        {t(state.notice)}
      </p>
      {state.error && !selection && (
        <div ref={failure} tabIndex={-1} className="form-notice" role="alert">
          {t(state.error)}
          <button
            className="proposal-text-button"
            disabled={state.pending}
            onClick={() => void reload()}
          >
            {state.blocked
              ? t('قراءة المهام الحالية')
              : t('إعادة تحميل المهام')}
          </button>
        </div>
      )}
      {!state.board && !state.error && (
        <LoadingPlaceholder label={t('بنفتح المهام…')} />
      )}
      {readonly && (
        <p className="task-readonly">
          {t('المشروع مكتمل أو ملغي؛ المهام محفوظة للقراءة فقط.')}{' '}
        </p>
      )}
      {state.board && (
        <TaskProgress
          progress={state.board.progress}
          label={t('تقدم كل مهام المشروع')}
        />
      )}
      {state.board && (
        <p className="proposal-footnote">
          {t(
            'كل المهام بنفس الوزن. اكتمالها ما بيغيّرش حالة المشروع تلقائيًا.',
          )}{' '}
        </p>
      )}
      {state.board && (
        <div className="task-lanes">
          {(Object.keys(taskStatuses) as TaskStatus[]).map((status) => {
            const lane = state.board!.tasks.filter(
              (task) => task.status === status,
            );
            return (
              <section
                className="task-lane"
                key={status}
                data-task-status={status}
                aria-labelledby={'task-lane-' + status}
              >
                <header>
                  <h3 id={'task-lane-' + status}>{t(taskStatuses[status])}</h3>
                  <span
                    className="task-count"
                    aria-label={countText('tasks', lane.length)}
                  >
                    {lane.length.toLocaleString(intlLocale)}
                  </span>
                </header>
                {lane.length === 0 ? (
                  <p className="task-lane-empty">{t('لسه مفيش مهام هنا.')}</p>
                ) : (
                  <ol>
                    {lane.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        lane={lane}
                        allTasks={state.board!.tasks}
                        readonly={readonly}
                        pending={state.pending || state.blocked}
                        onEdit={() => setSelection({ kind: 'edit', task })}
                        onDelete={() => setSelection({ kind: 'delete', task })}
                        onVisibility={() =>
                          setSelection({ kind: 'visibility', task })
                        }
                        onMove={move}
                      />
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}
      {state.board && <ClientTaskPreview view={state.board.clientView} />}
      <p className="proposal-footnote">
        {t(
          'التحكم في المهام داخل مساحتك. ظهور العميل باختيارك. حتى 200 مهمة في المشروع.',
        )}{' '}
      </p>
      {selection && (
        <TaskEditor
          selection={selection}
          pending={state.pending}
          blocked={state.blocked}
          error={state.error}
          onClose={() => setSelection(null)}
          onSave={save}
          onReload={reload}
          returnFocusRef={add}
        />
      )}
    </section>
  );
}
