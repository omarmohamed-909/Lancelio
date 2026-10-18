'use client';
import { useI18n } from '../../../i18n/language-provider';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  ArrowUpLeft,
  FileText,
  FolderKanban,
  Plus,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { searchWorkspace } from '../services/workspace-search-api';
import type { SearchResults } from '../services/workspace-search-api';

const kinds = {
  clients: { label: 'العملاء', icon: Users },
  projects: { label: 'المشاريع', icon: FolderKanban },
  proposals: { label: 'عروض الأسعار', icon: FileText },
  invoices: { label: 'الفواتير', icon: Wallet },
};
const actions = [
  {
    title: 'عميل جديد',
    description: 'احفظ بيانات عميلك وطرق التواصل.',
    href: '/clients?new=1',
    icon: Users,
  },
  {
    title: 'عرض سعر جديد',
    description: 'ابدأ اتفاق جديد بنطاق وسعر واضحين.',
    href: '/proposals/new',
    icon: FileText,
  },
  {
    title: 'مشروع جديد',
    description: 'ابدأ شغل جديد مع عميل موجود.',
    href: '/projects/new',
    icon: FolderKanban,
  },
  {
    title: 'فاتورة جديدة',
    description: 'جهّز البنود وراجعها قبل الإصدار.',
    href: '/invoices/new',
    icon: Wallet,
  },
];

export function WorkspaceActions() {
  const pathname = usePathname();
  return <Actions key={pathname} />;
}

function Actions() {
  const { t } = useI18n();
  const [mode, setMode] = useState<'search' | 'create' | null>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
        setMode('search');
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  return (
    <>
      <div className="workspace-actions">
        <button
          ref={searchButton}
          type="button"
          className="workspace-search-trigger"
          aria-label={t('البحث في مساحة العمل')}
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+k Meta+k"
          onClick={() => setMode('search')}
        >
          <Search size={18} aria-hidden="true" />
          <span>{t('ابحث في مساحتك')}</span>
          <kbd dir="ltr" aria-hidden="true">
            Ctrl K
          </kbd>
        </button>
        <button
          ref={createButton}
          type="button"
          className="workspace-create-trigger"
          aria-label={t('إضافة جديد')}
          aria-haspopup="dialog"
          onClick={() => setMode('create')}
        >
          <Plus size={19} aria-hidden="true" />
          <span>{t('إضافة جديد')}</span>
        </button>
      </div>
      {mode && (
        <ActionDialog
          mode={mode}
          close={() => setMode(null)}
          returnFocus={mode === 'search' ? searchButton : createButton}
        />
      )}
    </>
  );
}

function ActionDialog({
  mode,
  close,
  returnFocus,
}: {
  mode: 'search' | 'create';
  close: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const fallback = returnFocus.current;
    element?.showModal();
    element
      ?.querySelector<HTMLElement>(
        mode === 'search' ? 'input' : '.workspace-command-link',
      )
      ?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      else if (fallback?.isConnected) fallback.focus();
    };
  }, [mode, returnFocus]);
  return (
    <dialog
      ref={dialog}
      className="workspace-command"
      aria-labelledby="workspace-command-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        const element = event.currentTarget;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (
            event.target instanceof HTMLInputElement &&
            event.target.value &&
            event.key === 'ArrowUp'
          )
            return;
          const links = Array.from(
            element.querySelectorAll<HTMLAnchorElement>(
              '.workspace-command-link',
            ),
          );
          if (!links.length) return;
          event.preventDefault();
          const position = links.findIndex(
            (link) => link === document.activeElement,
          );
          const next =
            position < 0
              ? event.key === 'ArrowDown'
                ? 0
                : links.length - 1
              : (position +
                  (event.key === 'ArrowDown' ? 1 : -1) +
                  links.length) %
                links.length;
          links[next]?.focus();
        }
        if (event.key === 'Tab') {
          const controls = Array.from(
            element.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input, a[href]',
            ),
          );
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="workspace-command-heading">
        <div>
          <span className="form-eyebrow">{t('كل حاجة أقرب')}</span>
          <h2 id="workspace-command-title">
            {mode === 'search' ? t('البحث في مساحة العمل') : t('إضافة جديد')}
          </h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={t('إغلاق النافذة')}
          onClick={close}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {mode === 'search' ? (
        <SearchContent close={close} />
      ) : (
        <nav
          className="workspace-create-list"
          aria-label={t('اختار اللي هتضيفه')}
        >
          {actions.map(({ title, description, href, icon: Icon }) => (
            <Link
              className="workspace-command-link"
              key={href}
              href={href}
              onClick={close}
            >
              <span className="workspace-command-icon">
                <Icon size={21} aria-hidden="true" />
              </span>
              <span>
                <strong>{t(title)}</strong>
                <small>{t(description)}</small>
              </span>
              <ArrowUpLeft size={17} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      )}
      <div className="workspace-command-footer">
        <span>{t('↑ ↓ للتنقل بين النتائج')}</span>
        <span>
          <kbd>Esc</kbd> {t('للإغلاق')}{' '}
        </span>
      </div>
    </dialog>
  );
}

function SearchContent({ close }: { close: () => void }) {
  const { t, countText } = useI18n();
  const { manager } = useSession();
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    query: string;
    data: SearchResults | null;
    error: boolean;
  }>({ query: '', data: null, error: false });
  const text = query.trim();
  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void manager
        .authorized((token) => searchWorkspace(token, text, controller.signal))
        .then((data) => {
          if (!controller.signal.aborted)
            setState({ query: text, data, error: false });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setState({ query: text, data: null, error: true });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [manager, text, attempt]);
  const current = state.query === text;
  const pending =
    text.length >= 2 && (!current || (!state.data && !state.error));
  const data = current ? state.data : null;
  const error = current && state.error;
  const total =
    data?.groups.reduce((count, group) => count + group.items.length, 0) ?? 0;
  return (
    <>
      <div className="workspace-command-search">
        <label className="visually-hidden" htmlFor="workspace-search-input">
          {t('اسم العميل أو المشروع أو رقم الفاتورة')}{' '}
        </label>
        <Search size={20} aria-hidden="true" />
        <input
          id="workspace-search-input"
          type="search"
          maxLength={100}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setState({ query: '', data: null, error: false });
          }}
          placeholder={t('عميل، مشروع، عرض أو رقم فاتورة…')}
          autoComplete="off"
          spellCheck={false}
          aria-controls="workspace-search-results"
        />
      </div>
      <div
        id="workspace-search-results"
        className="workspace-search-results"
        aria-busy={pending}
      >
        {text.length < 2 && (
          <div className="workspace-command-empty">
            <Search size={28} aria-hidden="true" />
            <h3>{t('اكتب اسم، ووصل له أسرع')}</h3>
            <p>
              {t(
                'اكتب حرفين على الأقل للبحث في العملاء والمشاريع والعروض والفواتير.',
              )}{' '}
            </p>
          </div>
        )}
        {pending && (
          <LoadingPlaceholder label={t('بندور في مساحتك…')} count={3} />
        )}
        {error && (
          <div className="workspace-command-empty">
            <p role="alert">{t('مش قادرين نحمّل النتائج. جرّب تاني.')}</p>
            <button
              className="button button-secondary"
              onClick={() => {
                setState({ query: text, data: null, error: false });
                setAttempt((value) => value + 1);
              }}
            >
              {t('إعادة البحث')}{' '}
            </button>
          </div>
        )}
        <p className="visually-hidden" role="status" aria-live="polite">
          {data
            ? total
              ? countText('results', total)
              : t('مفيش نتائج مطابقة.')
            : ''}
        </p>
        {data && total === 0 && (
          <div className="workspace-command-empty">
            <Search size={28} aria-hidden="true" />
            <h3>{t('مفيش نتائج مطابقة')}</h3>
            <p>{t('جرّب جزء تاني من الاسم أو رقم الفاتورة.')}</p>
          </div>
        )}
        {data?.groups
          .filter((group) => group.items.length > 0)
          .map((group) => {
            const { label, icon: Icon } = kinds[group.kind];
            return (
              <section
                className="workspace-search-group"
                key={group.kind}
                aria-label={t(label)}
              >
                <h3>{t(label)}</h3>
                {group.items.map((item) => (
                  <Link
                    className="workspace-command-link"
                    key={item.id}
                    href={
                      group.kind === 'clients'
                        ? '/clients?' + new URLSearchParams({ client: item.id })
                        : '/' + group.kind + '/' + item.id
                    }
                    onClick={close}
                  >
                    <span className="workspace-command-icon">
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      {item.subtitle && <small>{item.subtitle}</small>}
                      {item.archived && <small>{t('عميل مؤرشف')}</small>}
                    </span>
                    <ArrowUpLeft size={16} aria-hidden="true" />
                  </Link>
                ))}
                {group.hasMore && (
                  <p className="workspace-search-more">
                    {t(
                      'دي أول ٥ نتائج في القسم؛ اكتب اسم أدق علشان توصل للباقي.',
                    )}{' '}
                  </p>
                )}
              </section>
            );
          })}
      </div>
    </>
  );
}
