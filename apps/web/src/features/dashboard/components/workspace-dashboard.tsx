'use client';
import { useI18n } from '../../../i18n/language-provider';

import { ArrowUpLeft, ChevronLeft, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSession } from '../../auth/components/session-provider';
import { WorkspaceShell } from '../../workspace/components/workspace-shell';
import { WorkspaceOverview } from './workspace-overview';
import { OverviewGuide } from './overview-guide';
import { upcoming } from '../../workspace/navigation';
export function WorkspaceDashboard() {
  return (
    <WorkspaceShell>
      <DashboardContent />
    </WorkspaceShell>
  );
}
function DashboardContent() {
  const { t } = useI18n();
  const { snapshot } = useSession();
  if (snapshot.status !== 'authenticated') return null;
  const identity = snapshot.identity;
  const role = {
    owner: t('مالك المساحة'),
    admin: t('مدير المساحة'),
    member: t('عضو المساحة'),
  }[identity.membership.role];
  return (
    <>
      <div className="dashboard-heading dashboard-hero dashboard-compact-heading">
        <div>
          <span className="hero-eyebrow">{t('نظرة عامة على مساحتك')}</span>
          <h1>
            {t('أهلًا،')} {identity.user.name}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{t('أرقام شغلك وآخر متابعة، في نظرة واحدة.')}</p>
        </div>
        <div className="hero-actions">
          <Link href="/proposals/new" className="button hero-primary">
            <Plus size={17} aria-hidden="true" /> {t('عرض سعر جديد')}{' '}
          </Link>
          <Link href="/projects" className="hero-secondary">
            {t('راجع مشاريعك')} <ArrowUpLeft size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <WorkspaceOverview key={identity.workspace.id}>
        <section className="welcome-panel">
          <div>
            <span className="welcome-pill">{t('الخطوة الجاية')}</span>
            <h2>{t('ضيف أول عميل.')}</h2>
            <p>
              {t(
                'احفظ اسمه وطرق التواصل، وبعدها اربط بيه عروضك ومشاريعك وفواتيرك.',
              )}{' '}
            </p>
          </div>
          <Link
            href="/clients"
            className="button button-primary welcome-action"
          >
            {t('افتح دفتر العملاء')}{' '}
            <ChevronLeft size={17} aria-hidden="true" />
          </Link>
        </section>
      </WorkspaceOverview>
      <div className="section-heading">
        <h2>{t('وصول سريع')}</h2>
      </div>
      <section
        className="module-grid dashboard-quick-tools"
        aria-label={t('أدوات مساحة العمل')}
      >
        {upcoming.map(({ label, icon: Icon, href }) => (
          <article
            className={
              'module-card' +
              (href !== null ? ' module-available' : ' module-upcoming')
            }
            key={label}
          >
            <span className="module-icon">
              <Icon size={22} strokeWidth={1.6} />
            </span>
            <div className="module-copy">
              <h3>
                {href !== null ? <Link href={href}>{t(label)}</Link> : label}
              </h3>
            </div>
            <ArrowUpLeft size={16} aria-hidden="true" />
          </article>
        ))}
      </section>
      <OverviewGuide />
      <section className="account-panel dashboard-account">
        <div>
          <span className="form-eyebrow">{t('هويتك في المساحة')}</span>
          <h2>{identity.workspace.name}</h2>
        </div>
        <dl>
          <div>
            <dt>{t('البريد الإلكتروني')}</dt>
            <dd dir="ltr">{identity.user.email}</dd>
          </div>
          <div>
            <dt>{t('صلاحيتك')}</dt>
            <dd>{role}</dd>
          </div>
        </dl>
        <span className="account-check">
          <ShieldCheck size={17} /> {t('دخول مؤمّن')}{' '}
        </span>
      </section>
      <footer className="dashboard-footer">
        <span>{t('من أول اتفاق لآخر تسليم.')}</span>
        <span lang="en" dir="ltr">
          Lancelio
        </span>
      </footer>
    </>
  );
}
