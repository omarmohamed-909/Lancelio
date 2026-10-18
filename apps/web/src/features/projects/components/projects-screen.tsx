'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { z } from 'zod';
import { ListOrderSelect } from '../../../components/ui/list-order';
import { useListPreferences } from '../../workspace/hooks/use-list-preferences';
import { listOrderSchema } from '../../../shared/schemas/list-order';
import type { ListOrder } from '../../../shared/schemas/list-order';
import { projectStatusSchema } from '../schemas/project';
import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft, FolderKanban, Plus, RefreshCw } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import {
  projectApi,
  projectError,
  projectStatusLabels,
} from '../services/project-api';
import type { ProjectPage, ProjectStatus } from '../schemas/project';
const preferencesSchema = z.object({
  status: projectStatusSchema.or(z.literal('all')),
  order: listOrderSchema,
});
const defaults = { status: 'all' as const, order: 'newest' as const };
export function ProjectsScreen() {
  const { t } = useI18n();
  const { snapshot } = useSession();
  const [{ status, order }, setPreferences] = useListPreferences(
    'projects',
    preferencesSchema,
    defaults,
  );
  const [revision, setRevision] = useState(0);
  if (snapshot.status !== 'authenticated') return null;
  return (
    <>
      <div className="dashboard-heading projects-heading">
        <div>
          <span className="form-eyebrow">{t('من الاتفاق للشغل')}</span>
          <h1>
            {t('المشاريع')}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{t('كل مشروع، عميله، والحالة اللي وصل لها.')}</p>
        </div>
        <Link href="/projects/new" className="button button-primary">
          <Plus size={18} />
          {t('مشروع جديد')}{' '}
        </Link>
      </div>
      <div className="project-list-toolbar">
        <div className="list-preferences-controls">
          <label htmlFor="project-filter">
            {t('حالة المشاريع')}{' '}
            <Select
              id="project-filter"
              value={status}
              onValueChange={(value) =>
                setPreferences((previous) => ({
                  ...previous,
                  status: value as ProjectStatus | 'all',
                }))
              }
            >
              <option value="all">{t('كل الحالات')}</option>
              {Object.entries(projectStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </Select>
          </label>
          <ListOrderSelect
            id="project-order"
            value={order}
            onChange={(order) =>
              setPreferences((previous) => ({ ...previous, order }))
            }
          />
        </div>
        <button
          className="icon-button"
          aria-label={t('تحديث المشاريع')}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="list-preferences-note">
        <span>{t('اختيارات العرض بتتحفظ على المتصفح ده.')}</span>
        {(status !== 'all' || order !== 'newest') && (
          <button
            className="proposal-text-button"
            onClick={() => setPreferences(defaults)}
          >
            {t('إعادة ضبط العرض')}{' '}
          </button>
        )}
      </div>
      <ProjectResults
        order={order}
        key={
          snapshot.identity.workspace.id +
          ':' +
          status +
          ':' +
          order +
          ':' +
          revision
        }
        status={status}
        reload={() => setRevision((value) => value + 1)}
      />
    </>
  );
}
function ProjectResults({
  status,
  order,
  reload,
}: {
  status: ProjectStatus | 'all';
  order: ListOrder;
  reload: () => void;
}) {
  const { t } = useI18n();
  const { manager } = useSession();
  const [page, setPage] = useState<ProjectPage | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void manager
      .authorized((token) =>
        projectApi.list(token, status, undefined, controller.signal, order),
      )
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(projectError(cause));
      });
    return () => controller.abort();
  }, [manager, status, order]);
  async function more() {
    if (!page?.nextCursor || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const next = await manager.authorized((token) =>
        projectApi.list(
          token,
          status,
          page.nextCursor ?? undefined,
          lifetime.current?.signal,
          order,
        ),
      );
      if (!lifetime.current?.signal.aborted)
        setPage((previous) => ({
          items: [...(previous?.items ?? []), ...next.items],
          nextCursor: next.nextCursor,
        }));
    } catch (cause: unknown) {
      if (!lifetime.current?.signal.aborted) setError(projectError(cause));
    } finally {
      busy.current = false;
      if (!lifetime.current?.signal.aborted) setPending(false);
    }
  }
  return (
    <>
      {error && (
        <div className="form-notice" role="alert">
          {t(error)}
          <button
            className="proposal-text-button"
            onClick={
              page
                ? () => {
                    void more();
                  }
                : reload
            }
          >
            {t('إعادة المحاولة')}{' '}
          </button>
        </div>
      )}
      {!page && !error && (
        <LoadingPlaceholder label={t('بنفتح دفتر المشاريع…')} />
      )}
      {page &&
        (page.items.length === 0 ? (
          <section className="client-book client-empty">
            <FolderKanban size={32} aria-hidden="true" />
            <h2>
              {status === 'all'
                ? t('مكان الشغل اللي اتفقنا عليه.')
                : t('مفيش مشاريع بالحالة دي.')}
            </h2>
            <p>
              {status === 'all'
                ? t('قبول عرض بيبدأ مشروع هنا، أو تقدر تبدأ مشروع بنفسك.')
                : t('جرّب حالة تانية لعرض باقي المشاريع.')}
            </p>
            {status === 'all' && (
              <Link href="/projects/new" className="button button-primary">
                {t('ابدأ مشروع')}{' '}
              </Link>
            )}
          </section>
        ) : (
          <div className="project-book">
            <ul>
              {page.items.map((project) => (
                <li key={project.id}>
                  <Link
                    className="project-row"
                    href={'/projects/' + project.id}
                  >
                    <div>
                      <h2>{project.title}</h2>
                      <p>
                        {project.client.name}
                        <span>
                          {' '}
                          ·{' '}
                          {project.origin === 'proposal'
                            ? t('من عرض مقبول')
                            : t('بداية يدوية')}
                        </span>
                      </p>
                    </div>
                    <span
                      className="project-status"
                      data-status={project.status}
                    >
                      {t(projectStatusLabels[project.status])}
                    </span>
                    <ArrowUpLeft size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      {page?.nextCursor && (
        <button
          className="button proposal-more"
          disabled={pending}
          onClick={() => {
            void more();
          }}
        >
          {pending ? t('بنحمّل باقي المشاريع…') : t('مشاريع أكتر')}
        </button>
      )}
      <p className="proposal-footnote">
        {t(
          'المشاريع خاصة بمساحتك. الاتفاق المقبول يفضل محفوظ مع المشروع.',
        )}{' '}
      </p>
    </>
  );
}
