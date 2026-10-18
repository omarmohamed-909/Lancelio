'use client';
import { useI18n } from '../../../i18n/language-provider';
import { formatMoney } from '../../../shared/money';
import type { PortalPage } from '../schemas/portal';
const projectStatus = {
  active: 'شغال',
  on_hold: 'متوقف',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};
const taskStatus = { todo: 'لسه', in_progress: 'قيد التنفيذ', done: 'خلصت' };
const paymentStatus = {
  unpaid: 'غير مدفوعة',
  partially_paid: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
};
export function PortalDocument({
  page,
  onNext,
  onFirst,
  preview = false,
}: {
  page: PortalPage;
  preview?: boolean;
  onNext: (kind: 'projects' | 'invoices', cursor: string) => void;
  onFirst: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const Heading = preview ? 'h2' : 'h1';
  return (
    <div className="portal-document">
      <header className="portal-document-heading">
        <span className="form-eyebrow">
          {t('دفتر المتابعة /')} {page.workspaceName}
        </span>
        <Heading>
          {page.client.name}
          <span className="greeting-dot">.</span>
        </Heading>
        {page.client.company && <p>{page.client.company}</p>}
        <p className="portal-asof">
          {t('آخر قراءة:')}{' '}
          {new Intl.DateTimeFormat(intlLocale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(page.asOf))}
        </p>
      </header>
      <section aria-label={t('المشاريع المشتركة')}>
        <div className="section-heading">
          <h2>{t('الشغل ماشي إزاي؟')}</h2>
          <span>{t('التقدم من المهام الظاهرة هنا')}</span>
        </div>
        {page.projects.length === 0 ? (
          <p className="portal-empty">
            {t('مفيش مشاريع في الصفحة دي حاليًا.')}
          </p>
        ) : (
          page.projects.map((project, index) => (
            <article className="portal-project" key={index}>
              <div className="portal-record-heading">
                <h3>{project.title}</h3>
                <span className="proposal-status">
                  {t(projectStatus[project.status])}
                </span>
              </div>
              {project.summary && (
                <p className="portal-project-summary">{project.summary}</p>
              )}
              <div className="portal-progress">
                <span>
                  {project.progress.percentage === null
                    ? t('لسه مفيش مهام ظاهرة')
                    : project.progress.done.toLocaleString(intlLocale) +
                      t(' من ') +
                      project.progress.total.toLocaleString(intlLocale) +
                      t(' خلصت')}
                </span>
                {project.progress.percentage !== null && (
                  <>
                    <strong>
                      {project.progress.percentage.toLocaleString(intlLocale)}
                      {t('٪')}{' '}
                    </strong>
                    <div
                      className="portal-progress-track"
                      role="progressbar"
                      aria-label={t('تقدم ') + project.title}
                      aria-valuenow={project.progress.percentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span
                        style={{ width: project.progress.percentage + '%' }}
                      />
                    </div>
                  </>
                )}
              </div>
              {project.tasks.length > 0 && (
                <ul className="portal-tasks">
                  {project.tasks.map((task, index) => (
                    <li key={index}>
                      <div>
                        <h4>{task.title}</h4>
                        {task.description && <p>{task.description}</p>}
                      </div>
                      <span>{t(taskStatus[task.status])}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
        {page.nextProjectCursor && (
          <button
            className="button"
            onClick={() => onNext('projects', page.nextProjectCursor!)}
          >
            {t('المزيد من المشاريع')}{' '}
          </button>
        )}
      </section>
      <section aria-label={t('الفواتير المشتركة')}>
        <div className="section-heading">
          <h2>{t('حساب الشغل')}</h2>
          <span>{t('الفواتير الصادرة فقط')}</span>
        </div>
        {page.invoices.length === 0 ? (
          <p className="portal-empty">
            {t('مفيش فواتير صادرة في الصفحة دي حاليًا.')}
          </p>
        ) : (
          page.invoices.map((invoice) => (
            <article className="portal-invoice" key={invoice.number}>
              <div className="portal-record-heading">
                <div>
                  <span className="form-eyebrow" dir="ltr">
                    {invoice.number}
                  </span>
                  <h3>{invoice.title}</h3>
                </div>
                <span className="proposal-status">
                  {t(paymentStatus[invoice.paymentStatus])}
                </span>
              </div>
              <p className="portal-asof">
                {t('صدرت')}{' '}
                {new Intl.DateTimeFormat(intlLocale, {
                  dateStyle: 'medium',
                }).format(new Date(invoice.issuedAt))}
              </p>
              <dl>
                {(
                  [
                    [t('قيمة الفاتورة'), invoice.totalMinor],
                    [t('المدفوع'), invoice.paidMinor],
                    [t('المتبقي'), invoice.remainingMinor],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{t(label)}</dt>
                    <dd>{formatMoney(value, invoice.currency, intlLocale)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))
        )}
        {page.nextInvoiceCursor && (
          <button
            className="button"
            onClick={() => onNext('invoices', page.nextInvoiceCursor!)}
          >
            {t('المزيد من الفواتير')}{' '}
          </button>
        )}
      </section>
      <div className="portal-document-footer">
        <p>
          {t(
            'الدفعات هنا مبالغ مسجلة يدويًا؛ أي استفسار عن الشغل يرجع لصاحب المساحة.',
          )}{' '}
        </p>
        <button className="text-button" onClick={onFirst}>
          {t('تحديث والرجوع لأول صفحة')}{' '}
        </button>
      </div>
    </div>
  );
}
