'use client';
import { useI18n } from '../../../i18n/language-provider';

import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, LoaderCircle, Plus, Users } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { errorMessage } from '../../auth/services/auth-api';
import { clientApi, clientError } from '../services/client-api';
import type { Client, ClientFilters } from '../schemas/client';
import { ClientRow } from './client-row';
import type { EditorSelection } from './client-editor';
export function ClientResults({
  filters,
  onSelect,
  onReload,
  onReset,
}: {
  filters: ClientFilters;
  onSelect: (selection: EditorSelection) => void;
  onReload: () => void;
  onReset: () => void;
}) {
  const { t, countText } = useI18n();
  const { manager } = useSession();
  const [items, setItems] = useState<Client[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{
    message: string;
    more: boolean;
  } | null>(null);
  const paging = useRef(false);
  const pageController = useRef<AbortController | null>(null);
  const search = filters.search.trim();
  const { archived, contact, order } = filters;
  useEffect(() => {
    const abort = new AbortController();
    const timeout = setTimeout(
      () => {
        void manager
          .authorized((token) =>
            clientApi.list(
              token,
              { archived, search, contact, order },
              undefined,
              abort.signal,
            ),
          )
          .then((page) => {
            if (!abort.signal.aborted) {
              setItems(page.items);
              setCursor(page.nextCursor);
            }
          })
          .catch((error: unknown) => {
            if (!abort.signal.aborted)
              setFailure({
                message: clientError(error) || errorMessage(error),
                more: false,
              });
          })
          .finally(() => {
            if (!abort.signal.aborted) setLoading(false);
          });
      },
      search ? 300 : 0,
    );
    return () => {
      clearTimeout(timeout);
      abort.abort();
      pageController.current?.abort();
    };
  }, [manager, archived, search, contact, order]);
  async function more() {
    if (paging.current || !cursor) return;
    paging.current = true;
    const abort = new AbortController();
    pageController.current = abort;
    setLoading(true);
    setFailure(null);
    try {
      const page = await manager.authorized((token) =>
        clientApi.list(
          token,
          { archived, search, contact, order },
          cursor,
          abort.signal,
        ),
      );
      if (abort.signal.aborted) return;
      setItems((previous) => [
        ...previous,
        ...page.items.filter(
          (item) => !previous.some((entry) => entry.id === item.id),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch (error: unknown) {
      if (!abort.signal.aborted)
        setFailure({
          message: clientError(error) || errorMessage(error),
          more: true,
        });
    } finally {
      paging.current = false;
      if (!abort.signal.aborted) setLoading(false);
    }
  }
  const filtered = !!search || contact !== 'all';
  return (
    <>
      {failure && (
        <div className="form-notice" role="alert">
          {t(failure.message)}
          <button
            className="text-button"
            disabled={loading}
            onClick={() => {
              if (failure.more) void more();
              else onReload();
            }}
          >
            {t('إعادة المحاولة')}{' '}
          </button>
        </div>
      )}
      {items.length > 0 && (
        <p className="client-results-summary" role="status">
          {t('المعروض:')} {countText('clients', items.length)}{' '}
          {cursor ? t(' — فيه نتائج أكتر') : ''}
        </p>
      )}
      <section
        className="client-book"
        aria-label={archived ? t('العملاء المؤرشفون') : t('العملاء الحاليون')}
        aria-busy={loading}
      >
        {loading && items.length === 0 ? (
          <LoadingPlaceholder label={t('بنفتح دفتر العملاء…')} />
        ) : !failure && items.length === 0 ? (
          <div className="client-empty">
            <div className="client-empty-art" aria-hidden="true">
              <span />
              <Users size={38} strokeWidth={1.2} />
            </div>
            <h2>
              {filtered
                ? t('مفيش نتائج للاختيارات دي.')
                : archived
                  ? t('الأرشيف لسه فاضي.')
                  : t('أول اسم، وبداية شغل جديدة.')}
            </h2>
            <p>
              {filtered
                ? t('جرّب اسم تاني أو وسيلة تواصل مختلفة.')
                : archived
                  ? t('أي عميل تأرشفه هتلاقي بياناته هنا.')
                  : t('ضيف عميلك الأول. باقي تفاصيله تقدر تكملها بعدين.')}
            </p>
            {filtered ? (
              <button className="button button-secondary" onClick={onReset}>
                {t('مسح البحث والفلترة')}{' '}
              </button>
            ) : (
              !archived && (
                <button
                  className="button button-secondary"
                  onClick={() => onSelect({ client: null, archive: false })}
                >
                  <Plus size={17} />
                  {t('إضافة أول عميل')}{' '}
                </button>
              )
            )}
          </div>
        ) : (
          items.length > 0 && (
            <>
              <div className="client-columns" aria-hidden="true">
                <span>{t('العميل')}</span>
                <span>{t('التواصل')}</span>
                <span>{t('إدارة السجل')}</span>
              </div>
              <ul className="client-list">
                {items.map((client) => (
                  <ClientRow
                    key={client.id}
                    client={client}
                    archived={archived}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
              {cursor && (
                <button
                  className="button button-secondary load-more"
                  disabled={loading || !!failure}
                  onClick={() => {
                    void more();
                  }}
                >
                  {loading ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <ArrowDown size={18} />
                  )}
                  {t('عرض المزيد')}{' '}
                </button>
              )}
            </>
          )
        )}
      </section>
    </>
  );
}
