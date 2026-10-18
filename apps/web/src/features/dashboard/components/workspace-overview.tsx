'use client';
import { useI18n } from '../../../i18n/language-provider';

import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import Link from 'next/link';
import { ArrowUpLeft, Info, RefreshCw } from 'lucide-react';
import { OverviewCountCard } from './overview-count-card';
import type { ReactNode } from 'react';
import { useWorkspaceOverview } from '../hooks/use-workspace-overview';
import { formatOverviewMoney } from '../utils/format-overview-money';
export function WorkspaceOverview({ children }: { children: ReactNode }) {
  const { t, intlLocale } = useI18n();
  const { data, pending, error, reload } = useWorkspaceOverview();
  return (
    <section
      className="work-overview"
      aria-label={t('ملخص مساحة العمل')}
      aria-busy={pending}
    >
      <div className="overview-heading">
        <div>
          <span className="form-eyebrow">{t('دفتر المتابعة')}</span>
          <h2>{t('الشغل بالأرقام')}</h2>
        </div>
        <button
          className="button button-secondary"
          disabled={pending}
          onClick={() => void reload()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {pending ? t('جارٍ القراءة…') : t('تحديث الأرقام')}
        </button>
      </div>
      {pending && (
        <LoadingPlaceholder
          label={t('بنقرأ وضع المساحة الحالي…')}
          kind="overview"
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {data && (
        <>
          <p className="overview-asof">
            {t('آخر قراءة:')}{' '}
            <time dateTime={data.asOf}>
              {new Intl.DateTimeFormat(intlLocale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(data.asOf))}
            </time>
          </p>
          {data.clients.active + data.clients.archived === 0 && children}
          <div className="overview-counts">
            <OverviewCountCard
              href="/clients"
              label={t('العملاء النشطين')}
              count={data.clients.active}
              details={[
                { label: t('في الأرشيف'), count: data.clients.archived },
              ]}
            />
            <OverviewCountCard
              href="/proposals"
              label={t('عروض مرسلة')}
              count={data.proposals.sent}
              details={[
                { label: t('مسودة'), count: data.proposals.draft },
                { label: t('مقبول'), count: data.proposals.accepted },
                { label: t('مرفوض'), count: data.proposals.rejected },
                { label: t('منتهي'), count: data.proposals.expired },
              ]}
            />
            <OverviewCountCard
              href="/projects"
              label={t('مشاريع شغالة')}
              count={data.projects.active}
              details={[
                { label: t('متوقف'), count: data.projects.on_hold },
                { label: t('مكتمل'), count: data.projects.completed },
                { label: t('ملغي'), count: data.projects.cancelled },
              ]}
            />
            <OverviewCountCard
              href="/invoices"
              label={t('فواتير صادرة')}
              count={data.invoices.issued}
              details={[{ label: t('مسودة'), count: data.invoices.draft }]}
            />
          </div>
          {(data.tasks.todo + data.tasks.in_progress > 0 ||
            data.expiringProposals.length > 0) && (
            <section
              className="overview-followup"
              aria-label={t('متابعة الشغل')}
            >
              <h3>{t('كمّل من هنا')}</h3>
              <div>
                {data.tasks.todo + data.tasks.in_progress > 0 && (
                  <Link href="/projects">
                    <span>
                      <strong>
                        {(
                          data.tasks.todo + data.tasks.in_progress
                        ).toLocaleString(intlLocale)}
                      </strong>{' '}
                      {t('مهام لسه مخلصتش')}{' '}
                    </span>
                    <ArrowUpLeft size={17} aria-hidden="true" />
                  </Link>
                )}
                {data.expiringProposals[0] && (
                  <Link href={'/proposals/' + data.expiringProposals[0].id}>
                    <span>{t('راجع أقرب رابط عرض للانتهاء')}</span>
                    <ArrowUpLeft size={17} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </section>
          )}
          <div className="overview-panels">
            <div className="overview-work-panels">
              <section
                className="overview-task-line"
                aria-label={t('توزيع مهام المشاريع')}
              >
                <div className="overview-section-heading">
                  <span className="overview-section-index" aria-hidden="true">
                    01
                  </span>
                  <div>
                    <h3>{t('مهام المشاريع الشغالة والمتوقفة')}</h3>
                    <p>{t('شوف اللي لسه، واللي بتشتغل عليه، واللي خلص.')}</p>
                  </div>
                </div>
                {data.tasks.todo + data.tasks.in_progress + data.tasks.done >
                0 ? (
                  <div className="overview-task-track" aria-hidden="true">
                    {(['todo', 'in_progress', 'done'] as const).map(
                      (status) => (
                        <span
                          key={status}
                          className={'task-segment task-segment-' + status}
                          style={{ flexGrow: data.tasks[status] }}
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <p className="overview-task-empty">
                    {t('لسه مفيش مهام في المشاريع الشغالة والمتوقفة.')}{' '}
                  </p>
                )}
                <dl className="overview-task-counts">
                  {(
                    [
                      ['todo', t('لسه')],
                      ['in_progress', t('قيد التنفيذ')],
                      ['done', t('خلصت')],
                    ] as const
                  ).map(([status, label]) => (
                    <div key={status} className={'task-count-' + status}>
                      <dt>
                        <span aria-hidden="true" />
                        {t(label)}
                      </dt>
                      <dd>{data.tasks[status].toLocaleString(intlLocale)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section
                className="overview-deadlines"
                aria-label={t('مواعيد روابط العروض')}
              >
                <div className="overview-section-heading">
                  <span className="overview-section-index" aria-hidden="true">
                    03
                  </span>
                  <div>
                    <h3>{t('روابط قرب تنتهي')}</h3>
                    <p>{t('أقرب ٥ روابط عروض متاحة، حسب موعد انتهائها.')}</p>
                  </div>
                </div>
                <p className="overview-scope-note">
                  {t(
                    'دي صلاحية روابط العروض؛ مواعيد تسليم المشاريع لسه مش مسجلة.',
                  )}{' '}
                </p>
                {data.expiringProposals.length === 0 ? (
                  <p className="overview-empty">
                    {t('مفيش روابط عروض متاحة حاليًا.')}{' '}
                  </p>
                ) : (
                  <ul>
                    {data.expiringProposals.map((proposal) => (
                      <li key={proposal.id}>
                        <Link href={'/proposals/' + proposal.id}>
                          {proposal.title}
                          <ArrowUpLeft size={16} aria-hidden="true" />
                        </Link>
                        <time dateTime={proposal.expiresAt}>
                          {new Intl.DateTimeFormat(intlLocale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(proposal.expiresAt))}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <section
              className="overview-finances"
              aria-label={t('الأرصدة حسب العملة')}
            >
              <div className="overview-section-heading">
                <span className="overview-section-index" aria-hidden="true">
                  02
                </span>
                <div>
                  <h3>{t('حساب الشغل')}</h3>
                  <p>{t('من بداية المساحة · كل عملة لوحدها')}</p>
                </div>
              </div>
              <details className="overview-explainer">
                <summary>
                  <Info size={16} aria-hidden="true" />{' '}
                  {t('الأرصدة دي بتتحسب إزاي؟')}{' '}
                </summary>
                <p>
                  {t(
                    'قيمة الفواتير = إجمالي الفواتير الصادرة. المقبوض = الدفعات السارية بعد استبعاد الإدخالات الملغاة. المتبقي = قيمة الفواتير ناقص المقبوض؛ المسودات مش داخلة في الحساب.',
                  )}{' '}
                </p>
              </details>
              {data.finances.length === 0 ? (
                <p className="overview-empty">
                  {t(
                    'لسه مفيش فواتير صادرة. الأرصدة هتظهر بعد أول إصدار.',
                  )}{' '}
                </p>
              ) : (
                data.finances.map((balance) => (
                  <article
                    className="overview-currency"
                    key={balance.currency}
                    aria-label={t('رصيد ') + balance.currency}
                  >
                    <h4 lang="en" dir="ltr">
                      {balance.currency}
                    </h4>
                    <dl>
                      {(
                        [
                          [t('قيمة الفواتير'), balance.invoicedMinor],
                          [t('المقبوض'), balance.receivedMinor],
                          [t('المتبقي'), balance.outstandingMinor],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label}>
                          <dt>{t(label)}</dt>
                          <dd>
                            {formatOverviewMoney(
                              value,
                              balance.currency,
                              intlLocale,
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
