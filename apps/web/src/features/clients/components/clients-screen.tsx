'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { ListOrderSelect } from '../../../components/ui/list-order';
import { useListPreferences } from '../../workspace/hooks/use-list-preferences';
import { clientFiltersSchema } from '../schemas/client';
import { notifySuccess } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage } from '../../auth/services/auth-api';
import { clientApi, clientError } from '../services/client-api';
import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { contactFilterSchema } from '../schemas/client';
import type { ClientFilters } from '../schemas/client';
import { ClientEditor } from './client-editor';
import type { EditorSelection } from './client-editor';
import { ClientResults } from './client-results';
const initialFilters: ClientFilters = {
  archived: false,
  search: '',
  contact: 'all',
  order: 'newest',
};
export function ClientsScreen({
  clientId,
  create = false,
}: { clientId?: string | undefined; create?: boolean } = {}) {
  const { t } = useI18n();
  const { snapshot, manager } = useSession();
  const router = useRouter();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useListPreferences(
    'clients',
    clientFiltersSchema,
    initialFilters,
  );
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [selection, setSelection] = useState<EditorSelection | null>(
    create ? { client: null, archive: false } : null,
  );
  const [entryError, setEntryError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    void manager
      .authorized((token) => clientApi.read(token, clientId, controller.signal))
      .then((client) => {
        if (!controller.signal.aborted)
          setSelection({ client, archive: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setEntryError(clientError(error) || errorMessage(error));
      });
    return () => controller.abort();
  }, [clientId, manager, retry]);
  function closeEntry() {
    setSelection(null);
    if (clientId || create) router.replace('/clients');
  }
  if (snapshot.status !== 'authenticated') return null;
  function changeFilters(update: Partial<ClientFilters>) {
    setFilters((previous) => ({ ...previous, ...update }));
    setNotice('');
  }
  function reload() {
    setRevision((previous) => previous + 1);
  }
  const resultsKey = JSON.stringify([
    snapshot.identity.workspace.id,
    filters.archived,
    filters.search.trim(),
    filters.contact,
    filters.order,
    revision,
  ]);
  return (
    <>
      <div className="dashboard-heading clients-heading">
        <div>
          <span className="form-eyebrow">{t('علاقات الشغل تبدأ هنا')}</span>
          <h1>
            {t('دفتر العملاء')}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{t('الاسم، وسيلة التواصل، والتفاصيل اللي تحب تفتكرها.')}</p>
        </div>
        <button
          className="button button-primary"
          ref={addButtonRef}
          disabled={Boolean(clientId && !selection && !entryError)}
          onClick={() => setSelection({ client: null, archive: false })}
        >
          <Plus size={18} />
          {t('عميل جديد')}{' '}
        </button>
      </div>
      <form
        className="client-search-filters"
        role="search"
        aria-label={t('البحث في دفتر العملاء')}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="client-search-field">
          <label className="filter-label" htmlFor="client-search">
            {t('البحث عن عميل')}{' '}
          </label>
          <div className="client-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              id="client-search"
              ref={searchInputRef}
              type="search"
              autoComplete="off"
              placeholder={t('اسم العميل أو الشركة أو البريد')}
              value={filters.search}
              maxLength={200}
              onChange={(event) =>
                changeFilters({
                  search: Array.from(event.target.value).slice(0, 100).join(''),
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  changeFilters({ search: '' });
                }
              }}
            />
            {filters.search && (
              <button
                className="icon-button"
                type="button"
                aria-label={t('مسح البحث')}
                onClick={() => {
                  changeFilters({ search: '' });
                  searchInputRef.current?.focus();
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="client-contact-filter">
          <label className="filter-label" htmlFor="client-contact-filter">
            {t('بيانات التواصل')}{' '}
          </label>
          <Select
            id="client-contact-filter"
            value={filters.contact}
            onValueChange={(value) => {
              const result = contactFilterSchema.safeParse(value);
              if (result.success) changeFilters({ contact: result.data });
            }}
          >
            <option value="all">{t('كل وسائل التواصل')}</option>
            <option value="email">{t('بريد إلكتروني متاح')}</option>
            <option value="phone">{t('رقم هاتف متاح')}</option>
            <option value="none">{t('بدون وسيلة تواصل')}</option>
          </Select>
        </div>
        <ListOrderSelect
          id="client-order"
          value={filters.order}
          onChange={(order) => changeFilters({ order })}
        />
      </form>
      <div className="list-preferences-note">
        <span>{t('اختيارات العرض بتتحفظ على المتصفح ده.')}</span>
        {(filters.archived ||
          filters.search ||
          filters.contact !== 'all' ||
          filters.order !== 'newest') && (
          <button
            className="proposal-text-button"
            onClick={() => {
              setFilters(initialFilters);
              setNotice('');
            }}
          >
            {t('إعادة ضبط العرض')}{' '}
          </button>
        )}
      </div>
      <div className="client-toolbar">
        <div
          className="client-status"
          role="group"
          aria-label={t('حالة العملاء')}
        >
          <button
            aria-pressed={!filters.archived}
            onClick={() => changeFilters({ archived: false })}
          >
            {t('الحاليون')}{' '}
          </button>
          <button
            aria-pressed={filters.archived}
            onClick={() => changeFilters({ archived: true })}
          >
            {t('المؤرشفون')}{' '}
          </button>
        </div>
        <button
          className="icon-button"
          aria-label={t('تحديث قائمة العملاء')}
          onClick={() => {
            setNotice('');
            reload();
          }}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {notice && (
        <p className="client-success" role="status">
          {t(notice)}
        </p>
      )}
      {clientId && !selection && !entryError && (
        <LoadingPlaceholder
          label={t('بنفتح بيانات العميل…')}
          kind="form"
          count={1}
        />
      )}
      {entryError && (
        <div className="form-notice" role="alert">
          {t(entryError)}
          <button
            className="button button-secondary"
            onClick={() => {
              setEntryError('');
              setRetry((value) => value + 1);
            }}
          >
            {t('إعادة فتح العميل')}{' '}
          </button>
        </div>
      )}
      {(!clientId || selection || entryError) && (
        <ClientResults
          key={resultsKey}
          filters={filters}
          onSelect={setSelection}
          onReload={reload}
          onReset={() => {
            changeFilters({ search: '', contact: 'all' });
            searchInputRef.current?.focus();
          }}
        />
      )}
      <p className="client-footnote">
        {t(
          'التفاصيل دي خاصة بمساحة عملك. العملاء المؤرشفون يفضلوا محفوظين للرجوع إليهم.',
        )}{' '}
      </p>
      {selection && (
        <ClientEditor
          selection={selection}
          returnFocusRef={addButtonRef}
          onClose={closeEntry}
          onSaved={(message) => {
            if (selection.client === null)
              setFilters((previous) => ({
                ...previous,
                archived: false,
                search: '',
                contact: 'all',
              }));
            closeEntry();
            setNotice(message);
            notifySuccess(message);
            reload();
          }}
        />
      )}
    </>
  );
}
