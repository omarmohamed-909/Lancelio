'use client';
import Link from 'next/link';
import {
  ArrowUpLeft,
  FileText,
  FolderKanban,
  Users,
  Wallet,
} from 'lucide-react';
import { localeTag } from '../../../i18n/locale';
import type { Locale } from '../../../i18n/locale';
import { translate } from '../../../i18n/translate';
import { formatOverviewMoney } from '../../dashboard/utils/format-overview-money';
import { assistantHelp } from '../help';
import type { AssistantReply } from '../services/assistant-api';

const kinds = {
  clients: { icon: Users, label: 'العملاء' },
  projects: { icon: FolderKanban, label: 'المشاريع' },
  proposals: { icon: FileText, label: 'عروض الأسعار' },
  invoices: { icon: Wallet, label: 'الفواتير' },
};
const statuses: Record<string, string> = {
  active: 'شغال',
  on_hold: 'متوقف',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  archived: 'مؤرشف',
  outstanding: 'المتبقي',
};
export function AssistantAnswer({
  reply,
  close,
  locale,
}: {
  reply: AssistantReply;
  close: () => void;
  locale: Locale;
}) {
  const t = (message: string | undefined) => translate(locale, message ?? '');
  const intlLocale = localeTag(locale);
  const { plan, records, facts } = reply;
  const help = assistantHelp[plan.topic];
  const notebooks = [...new Set(records.map((record) => record.kind))];
  return (
    <div
      className="assistant-answer"
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      {reply.degraded && (
        <p className="assistant-guided-note">
          {t(
            'الفهم الذكي غير متاح حاليًا. دي نتيجة الإرشادات والاستعلامات المحددة.',
          )}
        </p>
      )}
      {plan.intent === 'help' && (
        <>
          <p className="assistant-answer-title">{t(help.title)}</p>
          {plan.topic === 'product' ? (
            help.steps.map((step) => <p key={step}>{t(step)}</p>)
          ) : (
            <ol>
              {help.steps.map((step) => (
                <li key={step}>{t(step)}</li>
              ))}
            </ol>
          )}
          <Link className="assistant-source" href={help.href} onClick={close}>
            {t(help.action)}
            <ArrowUpLeft size={15} aria-hidden="true" />
          </Link>
        </>
      )}
      {plan.intent === 'clarify' && (
        <p>
          {t(
            'أقدر أشرح استخدام الموقع وأعرض ملخص شغلك والمشاريع والمستحقات. جرّب سؤال من الاقتراحات، أو اكتب «ابحث عن» وبعدها اسم أو رقم فاتورة.',
          )}
        </p>
      )}
      {plan.intent === 'overview' && facts && (
        <>
          <p className="assistant-answer-title">
            {t('دي لقطة من شغلك دلوقتي')}
          </p>
          <dl className="assistant-facts">
            {[
              ['عملاء نشطون', facts.clients],
              ['مشاريع مفتوحة', facts.projects],
              ['مهام لم تكتمل', facts.tasks],
            ].map(([label, count]) => (
              <div key={label}>
                <dt>{t(String(label))}</dt>
                <dd>{Number(count).toLocaleString(intlLocale)}</dd>
              </div>
            ))}
          </dl>
          {facts.finances.length > 0 && (
            <div className="assistant-balances">
              <span>{t('المستحقات حسب العملة')}</span>
              {facts.finances.map((balance) => (
                <div key={balance.currency}>
                  <span>{balance.currency}</span>
                  <strong>
                    {formatOverviewMoney(
                      balance.outstandingMinor,
                      balance.currency,
                      intlLocale,
                    )}
                  </strong>
                </div>
              ))}
            </div>
          )}
          <Link href="/dashboard" className="assistant-source" onClick={close}>
            {t('فتح لوحة المتابعة')}
            <ArrowUpLeft size={15} aria-hidden="true" />
          </Link>
        </>
      )}
      {['projects', 'receivables', 'search'].includes(plan.intent) && (
        <>
          <p className="assistant-answer-title">
            {plan.intent === 'projects'
              ? t('المشاريع المطابقة لسؤالك')
              : plan.intent === 'receivables'
                ? t('فواتير صادرة ولسه عليها مستحقات')
                : t('نتائج من دفاتر مساحتك')}
          </p>
          {plan.intent === 'receivables' && (
            <p className="assistant-guided-note">
              {t('دي مبالغ متبقية، مش حكم على تأخر السداد. كل فاتورة بعملتها.')}
            </p>
          )}
          {records.length === 0 && (
            <p>{t('مفيش نتائج مطابقة في مساحة العمل حاليًا.')}</p>
          )}
          <ul className="assistant-records">
            {records.map((record) => {
              const Icon = kinds[record.kind].icon;
              const href =
                record.kind === 'clients'
                  ? '/clients?client=' + record.id
                  : '/' + record.kind + '/' + record.id;
              return (
                <li key={record.kind + ':' + record.id}>
                  <Link href={href} onClick={close}>
                    <Icon size={18} aria-hidden="true" />
                    <span>
                      <strong dir="auto">{record.title}</strong>
                      <small dir="auto">{record.subtitle}</small>
                      {record.amountMinor !== null && record.currency && (
                        <b>
                          {formatOverviewMoney(
                            record.amountMinor,
                            record.currency,
                            intlLocale,
                          )}
                        </b>
                      )}
                      {statuses[record.status] && (
                        <small>{t(statuses[record.status])}</small>
                      )}
                    </span>
                    <ArrowUpLeft size={15} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {reply.hasMore && (
            <p className="assistant-guided-note">
              {t('دي نتائج محدودة؛ افتح الدفتر لعرض باقي السجلات.')}
            </p>
          )}
          <div className="assistant-notebooks">
            {(notebooks.length
              ? notebooks
              : plan.intent === 'projects'
                ? ['projects' as const]
                : plan.intent === 'receivables'
                  ? ['invoices' as const]
                  : []
            ).map((kind) => (
              <Link
                key={kind}
                href={'/' + kind}
                className="assistant-source"
                onClick={close}
              >
                {t(kinds[kind].label)}
                <ArrowUpLeft size={15} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </>
      )}
      {reply.asOf && (
        <p className="assistant-read-at">
          {t('وقت قراءة البيانات:')}{' '}
          <time dateTime={reply.asOf}>
            {new Intl.DateTimeFormat(intlLocale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(reply.asOf))}
          </time>
        </p>
      )}
    </div>
  );
}
