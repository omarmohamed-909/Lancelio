'use client';
import { useI18n } from '../../../i18n/language-provider';

import { notifySuccess } from '../../../components/ui/feedback';
import { ProjectTasks } from '../../tasks/components/task-board';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import {
  projectApi,
  projectError,
  projectStatusLabels,
} from '../services/project-api';
import type { Project } from '../schemas/project';
import { ProposalDocument } from '../../proposals/components/proposal-document';
import { ProjectStatusControl } from './project-status';
export function ProjectDetails({ id }: { id: string }) {
  const { snapshot } = useSession();
  const [revision, setRevision] = useState(0);
  if (snapshot.status !== 'authenticated') return null;
  return (
    <Load
      key={snapshot.identity.workspace.id + ':' + id + ':' + revision}
      id={id}
      restoreFocus={revision > 0}
      reload={() => setRevision((value) => value + 1)}
    />
  );
}
function Load({
  id,
  reload,
  restoreFocus,
}: {
  id: string;
  reload: () => void;
  restoreFocus: boolean;
}) {
  const { t, intlLocale } = useI18n();
  const { manager } = useSession();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Project['status'] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void manager
      .authorized((token) => projectApi.read(token, id, controller.signal))
      .then((result) => {
        if (!controller.signal.aborted) setProject(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(projectError(cause));
      });
    return () => controller.abort();
  }, [manager, id]);
  if (error)
    return (
      <section className="proposal-state">
        <h1>{t('مش قادرين نفتح المشروع')}</h1>
        <p role="alert">{t(error)}</p>
        <button className="button" onClick={reload}>
          {t('إعادة المحاولة')}{' '}
        </button>
        <Link href="/projects">{t('الرجوع للمشاريع')}</Link>
      </section>
    );
  if (!project)
    return (
      <p className="proposal-state" role="status">
        {t('بنفتح تفاصيل المشروع…')}{' '}
      </p>
    );
  return (
    <>
      <div className="proposal-page-bar">
        <Link href="/projects">
          <ArrowRight size={16} />
          {t('كل المشاريع')}{' '}
        </Link>
        <span className="project-status" data-status={project.status}>
          {t('مشروع')} {t(projectStatusLabels[project.status])}
        </span>
      </div>
      <p className="project-update-notice" role="status">
        {notice &&
          t('تم تحديث حالة المشروع إلى «{0}».', [
            t(projectStatusLabels[notice]),
          ])}
      </p>
      <ProjectStatusControl
        key={project.id + ':' + project.version}
        project={project}
        focusOnMount={restoreFocus || notice !== null}
        onChange={(result) => {
          setProject(result);
          notifySuccess(t('حالة المشروع اتحدّثت.'));
          setNotice(result.status);
        }}
        reload={reload}
      />
      {project.origin === 'proposal' ? (
        <>
          <div className="project-agreement-link">
            <span className="form-eyebrow">{t('مشروع بدأ من عرض مقبول')}</span>
            <Link href={'/proposals/' + project.sourceProposalId}>
              {t('عرض الاتفاق')}{' '}
            </Link>
          </div>
          <ProposalDocument
            proposal={{ ...project, status: 'accepted' }}
            metadata={
              <>
                <span className="form-eyebrow">{t('اتفقنا يوم')}</span>
                <p>
                  {new Intl.DateTimeFormat(intlLocale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(project.acceptedAt))}
                </p>
              </>
            }
            footer={t(
              'نطاق الشغل والأسعار وشروط الاتفاق محفوظة من العرض المقبول.',
            )}
          />
        </>
      ) : (
        <article className="proposal-document project-manual">
          <header className="proposal-document-header">
            <span className="form-eyebrow">{t('مشروع يدوي')}</span>
            <h1>{project.title}</h1>
          </header>
          <section className="proposal-recipient">
            <div>
              <span className="form-eyebrow">{t('العميل')}</span>
              <h2>{project.client.name}</h2>
              {project.client.company && <p>{project.client.company}</p>}
              {project.client.email && <p dir="ltr">{project.client.email}</p>}
              {project.client.phone && <p dir="ltr">{project.client.phone}</p>}
            </div>
            <div>
              <span className="form-eyebrow">{t('بدأ يوم')}</span>
              <p>
                {new Intl.DateTimeFormat(intlLocale, {
                  dateStyle: 'medium',
                }).format(new Date(project.createdAt))}
              </p>
            </div>
          </section>
          <section className="proposal-copy">
            <h2>{t('وصف المشروع')}</h2>
            <p>{project.summary || t('مفيش وصف إضافي للمشروع.')}</p>
          </section>
          <footer className="proposal-document-footer">
            {t(
              'بداية يدوية، بدون اتفاق مالي مرفق. بيانات العميل محفوظة وقت إنشاء المشروع.',
            )}{' '}
          </footer>
        </article>
      )}
      <ProjectTasks
        key={'tasks:' + project.id + ':' + project.version}
        projectId={project.id}
        projectStatus={project.status}
        onProjectRefresh={reload}
      />
    </>
  );
}
