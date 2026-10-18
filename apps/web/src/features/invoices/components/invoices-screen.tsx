'use client';
import { useI18n } from '../../../i18n/language-provider';

import { ListOrderSelect } from '../../../components/ui/list-order';
import { useListPreferences } from '../../workspace/hooks/use-list-preferences';
import {
  defaultListOrder,
  listOrderPreferencesSchema,
} from '../../../shared/schemas/list-order';
import type { ListOrder } from '../../../shared/schemas/list-order';
import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft, FileText, Plus, RefreshCw } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { formatMoney } from '../../../shared/money';
import type { InvoicePage } from '../schemas/invoice';
import { invoiceApi, invoiceError } from '../services/invoice-api';
export function InvoicesScreen() {
  const { t } = useI18n();
  const { snapshot } = useSession();
  const [{ order }, setPreferences] = useListPreferences(
    'invoices',
    listOrderPreferencesSchema,
    defaultListOrder,
  );
  const [revision, setRevision] = useState(0);
  if (snapshot.status !== 'authenticated') return null;
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="form-eyebrow">{t('رقم ثابت، وكل بند بسعره')}</span>
          <h1>
            {t('الفواتير')}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{t('فواتيرك ومسوداتها، بالترتيب اللي يناسبك.')}</p>
        </div>
        <Link className="button button-primary" href="/invoices/new">
          <Plus size={18} />
          {t('فاتورة جديدة')}{' '}
        </Link>
      </div>
      <div className="proposal-list-caption">
        <ListOrderSelect
          id="invoice-order"
          value={order}
          onChange={(order) => setPreferences({ order })}
        />
        <button
          className="icon-button"
          aria-label={t('تحديث الفواتير')}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="list-preferences-note">
        <span>{t('ترتيب العرض بيتحفظ على المتصفح ده.')}</span>
        {order !== 'newest' && (
          <button
            className="proposal-text-button"
            onClick={() => setPreferences(defaultListOrder)}
          >
            {t('إعادة ضبط العرض')}{' '}
          </button>
        )}
      </div>
      <InvoiceResults
        order={order}
        key={snapshot.identity.workspace.id + ':' + order + ':' + revision}
        retry={() => setRevision((value) => value + 1)}
      />
    </>
  );
}
function InvoiceResults({
  retry,
  order,
}: {
  retry: () => void;
  order: ListOrder;
}) {
  const { t, intlLocale, countText } = useI18n();
  const { manager } = useSession();
  const [page, setPage] = useState<InvoicePage | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void manager
      .authorized((token) =>
        invoiceApi.list(token, undefined, controller.signal, order),
      )
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(invoiceError(cause));
      });
    return () => controller.abort();
  }, [manager, order]);
  async function more() {
    if (!page?.nextCursor || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const next = await manager.authorized((token) =>
        invoiceApi.list(
          token,
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
      if (!lifetime.current?.signal.aborted) setError(invoiceError(cause));
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
                : retry
            }
          >
            {t('إعادة المحاولة')}{' '}
          </button>
        </div>
      )}
      {!page && !error && (
        <LoadingPlaceholder label={t('بنفتح دفتر الفواتير…')} />
      )}
      {page &&
        (page.items.length === 0 ? (
          <section className="client-book client-empty">
            <div className="proposal-empty-paper" aria-hidden="true">
              <FileText size={35} />
              <span>{t('فاتورة')}</span>
            </div>
            <h2>{t('أول فاتورة في الدفتر.')}</h2>
            <p>{t('اختار العميل وراجع البنود. الرقم بيتخصص عند الحفظ.')}</p>
            <Link href="/invoices/new" className="button button-primary">
              {t('اكتب أول فاتورة')}{' '}
            </Link>
          </section>
        ) : (
          <div className="proposal-book">
            <div className="proposal-columns" aria-hidden="true">
              <span>{t('الفاتورة والعميل')}</span>
              <span>{t('الإجمالي')}</span>
              <span>{t('الحالة')}</span>
            </div>
            <ul>
              {page.items.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    className="proposal-row"
                    href={'/invoices/' + invoice.id}
                  >
                    <div>
                      <span className="invoice-number" dir="ltr">
                        {invoice.number}
                      </span>
                      <h2>{invoice.title}</h2>
                      <p>
                        {invoice.client.name}
                        <span> · {countText('items', invoice.itemCount)}</span>
                      </p>
                    </div>
                    <strong className="proposal-amount">
                      {formatMoney(
                        invoice.totalMinor,
                        invoice.currency,
                        intlLocale,
                      )}
                    </strong>
                    <div className="proposal-row-end">
                      <span className="proposal-status">
                        {invoice.status === 'draft' ? t('مسودة') : t('صادرة')}
                      </span>
                      <ArrowUpLeft size={17} />
                    </div>
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
          {pending ? t('بنحمّل باقي الفواتير…') : t('فواتير أكتر')}
        </button>
      )}
      <p className="proposal-footnote">
        {t(
          'المسودة خاصة. إصدار الفاتورة بيثبت بياناتها؛ بعدها تقدر تشاركها.',
        )}{' '}
      </p>
    </>
  );
}
