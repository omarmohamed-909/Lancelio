'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Check } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { clientApi } from '../../clients/services/client-api';
import type { Client } from '../../clients/schemas/client';
import { errorMessage } from '../../auth/services/auth-api';
import type { ProposalClient } from '../schemas/proposal';

export function ClientPicker({
  selected,
  onSelect,
  error,
  searchLabel = 'البحث عن عميل للعرض',
}: {
  searchLabel?: string;
  selected: ProposalClient | null;
  onSelect: (client: ProposalClient) => void;
  error?: string | undefined;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [choosing, setChoosing] = useState(selected === null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!choosing && restoreFocus.current) {
      changeRef.current?.focus();
      restoreFocus.current = false;
    }
  }, [choosing]);
  function close() {
    restoreFocus.current = true;
    setChoosing(false);
    setSearch('');
  }
  return (
    <div
      className="proposal-client-picker"
      role="group"
      aria-labelledby="proposal-client-label"
    >
      <span className="proposal-client-label" id="proposal-client-label">
        {t('العميل')}{' '}
      </span>
      {selected && (
        <div className="proposal-selected-client" key={selected.id}>
          <Check size={16} aria-hidden="true" />
          <div role="status">
            <strong>{selected.name}</strong>
            {(selected.company || selected.email) && (
              <span>{selected.company || selected.email}</span>
            )}
          </div>
          <button
            type="button"
            ref={changeRef}
            className="proposal-change-client"
            aria-expanded={choosing}
            aria-controls="proposal-client-choices"
            onClick={() => (choosing ? close() : setChoosing(true))}
          >
            {choosing ? t('إلغاء التغيير') : t('تغيير العميل')}
          </button>
        </div>
      )}
      <div id="proposal-client-choices" hidden={!choosing}>
        {choosing && (
          <>
            <label className="field-help" htmlFor="proposal-client-search">
              {t(searchLabel)}
            </label>
            <div className="proposal-search">
              <Search size={17} aria-hidden="true" />
              <input
                id="proposal-client-search"
                type="search"
                placeholder={t('اسم العميل أو الشركة أو البريد')}
                value={search}
                aria-invalid={!!error}
                aria-describedby={error ? 'proposal-client-error' : undefined}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    if (selected) close();
                    else setSearch('');
                  }
                }}
                onChange={(event) =>
                  setSearch(
                    Array.from(event.target.value).slice(0, 100).join(''),
                  )
                }
              />
            </div>
            <PickerResults
              key={search.trim() + ':' + revision}
              search={search.trim()}
              selectedId={selected?.id}
              onSelect={(value) => {
                onSelect(value);
                close();
              }}
              retry={() => setRevision((value) => value + 1)}
            />
          </>
        )}
      </div>
      {error && (
        <p className="field-error" id="proposal-client-error">
          {t(error)}
        </p>
      )}
    </div>
  );
}
function PickerResults({
  search,
  selectedId,
  onSelect,
  retry,
}: {
  search: string;
  selectedId: string | undefined;
  onSelect: (client: ProposalClient) => void;
  retry: () => void;
}) {
  const { t } = useI18n();
  const { manager } = useSession();
  const [items, setItems] = useState<Client[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const timer = setTimeout(() => {
      void manager
        .authorized((token) =>
          clientApi.list(
            token,
            { archived: false, search, contact: 'all', order: 'newest' },
            undefined,
            controller.signal,
          ),
        )
        .then((page) => {
          if (!controller.signal.aborted) {
            setItems(page.items);
            setCursor(page.nextCursor);
            setPending(false);
          }
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setError(errorMessage(cause));
            setPending(false);
          }
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [manager, search]);
  async function more() {
    if (!cursor || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const page = await manager.authorized((token) =>
        clientApi.list(
          token,
          { archived: false, search, contact: 'all', order: 'newest' },
          cursor,
          lifetime.current?.signal,
        ),
      );
      if (!lifetime.current?.signal.aborted) {
        setItems((previous) => [...previous, ...page.items]);
        setCursor(page.nextCursor);
      }
    } catch (cause: unknown) {
      if (!lifetime.current?.signal.aborted) setError(errorMessage(cause));
    } finally {
      busy.current = false;
      if (!lifetime.current?.signal.aborted) setPending(false);
    }
  }
  return (
    <>
      <ul
        className="proposal-client-options"
        aria-label={t('العملاء المتاحون')}
      >
        {items.map((client) => (
          <li key={client.id}>
            <button
              type="button"
              aria-pressed={client.id === selectedId}
              onClick={() =>
                onSelect({
                  id: client.id,
                  name: client.name,
                  email: client.email,
                  phone: client.phone,
                  company: client.company,
                })
              }
            >
              <span>
                {client.name}
                <small>
                  {client.company || client.email || t('بدون تفاصيل إضافية')}
                </small>
              </span>
              {client.id === selectedId && <Check size={16} />}
            </button>
          </li>
        ))}
      </ul>
      {pending && (
        <p role="status" className="field-help">
          {t('بندور في دفتر العملاء…')}{' '}
        </p>
      )}
      {error && (
        <div className="form-notice" role="alert">
          {t(error)}
          <button
            type="button"
            onClick={
              items.length
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
      {!pending && !error && items.length === 0 && (
        <p className="field-help">
          {t('مفيش عملاء مطابقين.')}{' '}
          <Link href="/clients">{t('افتح دفتر العملاء لإضافة عميل')}</Link>.
        </p>
      )}
      {cursor && (
        <button
          type="button"
          className="proposal-text-button"
          disabled={pending}
          onClick={() => {
            void more();
          }}
        >
          {t('عملاء أكتر')}{' '}
        </button>
      )}
    </>
  );
}
