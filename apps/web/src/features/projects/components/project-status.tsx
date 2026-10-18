'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import {
  projectApi,
  projectError,
  projectStatusLabels,
  projectTransitions,
  uncertainProjectWrite,
} from '../services/project-api';
import type { Project, ProjectStatus } from '../schemas/project';
export function ProjectStatusControl({
  project,
  onChange,
  reload,
  focusOnMount,
}: {
  project: Project;
  onChange: (project: Project) => void;
  reload: () => void;
  focusOnMount: boolean;
}) {
  const { t } = useI18n();
  const { manager } = useSession();
  const choices = projectTransitions[project.status];
  const [selected, setSelected] = useState<ProjectStatus>(
    choices[0] ?? project.status,
  );
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const guard = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const confirmation = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const failure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);
  useEffect(() => {
    if (error) failure.current?.focus();
  }, [error]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (confirming) confirmation.current?.focus();
    else if (restore.current) {
      trigger.current?.focus();
      restore.current = false;
    }
  }, [confirming]);
  async function save() {
    if (guard.current || pending || blocked || !confirming) return;
    guard.current = true;
    setPending(true);
    setError('');
    let holdGuard = true;
    try {
      const controller = lifetime.current;
      if (!controller) return;
      const result = await manager.authorized((token) =>
        projectApi.changeStatus(
          token,
          project.id,
          project.version,
          selected,
          controller.signal,
        ),
      );
      if (!controller.signal.aborted) onChange(result);
    } catch (cause: unknown) {
      if (!lifetime.current?.signal.aborted) {
        const unknown = uncertainProjectWrite(cause);
        holdGuard =
          unknown ||
          (cause instanceof ApiError &&
            (cause.code === 'PROJECT_CONFLICT' ||
              cause.code === 'PROJECT_STATUS_INVALID'));
        setBlocked(holdGuard);
        setError(
          unknown
            ? t(
                'نتيجة التغيير مش مؤكدة. اقرأ الحالة الحالية قبل أي تغيير جديد.',
              )
            : projectError(cause),
        );
        setConfirming(false);
      }
    } finally {
      guard.current = holdGuard;
      if (!lifetime.current?.signal.aborted) setPending(false);
    }
  }
  return (
    <section
      className="project-status-panel"
      aria-labelledby="project-status-heading"
    >
      <div>
        <span className="form-eyebrow">{t('متابعة الشغل')}</span>
        <h2
          ref={heading}
          tabIndex={-1}
          aria-describedby="project-current-status"
          id="project-status-heading"
        >
          {t('حالة المشروع')}{' '}
        </h2>
        <span
          id="project-current-status"
          className="project-status"
          data-status={project.status}
        >
          {t(projectStatusLabels[project.status])}
        </span>
      </div>
      {error && (
        <div ref={failure} tabIndex={-1} className="form-notice" role="alert">
          {t(error)}
          {blocked && (
            <button className="proposal-text-button" onClick={reload}>
              {t('قراءة الحالة الحالية')}{' '}
            </button>
          )}
        </div>
      )}
      {choices.length === 0 ? (
        <p>{t('الحالة نهائية. تفاصيل المشروع والاتفاق محفوظين للرجوع لهم.')}</p>
      ) : (
        <fieldset className="project-status-form" disabled={pending || blocked}>
          {confirming ? (
            <div
              className="project-status-confirm"
              role="group"
              aria-label={t('تأكيد تغيير الحالة')}
            >
              <p>
                {t('تغيير الحالة إلى «')}
                {t(projectStatusLabels[selected])}
                {t('»؟')}{' '}
                {(selected === 'completed' || selected === 'cancelled') &&
                  t(' الحالة دي نهائية ومش هتقدر تفتح المشروع تاني.')}
              </p>
              <div>
                <button
                  ref={confirmation}
                  className="button button-primary"
                  onClick={() => {
                    void save();
                  }}
                >
                  {pending ? t('بنحفظ الحالة…') : t('تأكيد الحالة')}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    restore.current = true;
                    setConfirming(false);
                  }}
                >
                  {t('رجوع')}{' '}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="project-status-field">
                <label htmlFor="project-next-status">
                  {t('الحالة الجديدة')}
                </label>
                <Select
                  id="project-next-status"
                  value={selected}
                  onValueChange={(value) => setSelected(value as ProjectStatus)}
                >
                  {choices.map((status) => (
                    <option key={status} value={status}>
                      {t(projectStatusLabels[status])}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                ref={trigger}
                className="button button-secondary"
                onClick={() => setConfirming(true)}
              >
                {t('تحديث حالة المشروع')}{' '}
              </button>
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
