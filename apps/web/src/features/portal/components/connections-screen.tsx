'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import {
  ArrowUpLeft,
  Handshake,
  MailOpen,
  ShieldCheck,
  RefreshCw,
  Check,
  X,
  LogOut,
} from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { WorkspaceShell } from '../../workspace/components/workspace-shell';
import { useI18n } from '../../../i18n/language-provider';
import { Brand } from '../../../components/ui/brand';
import { confirmAction } from '../../../components/ui/feedback';
import {
  pendingInvitation,
  rememberInvitation,
  clearInvitation,
} from '../../auth/services/invitation-return';
import {
  clientAccessApi,
  clientAccessError,
} from '../services/client-access-api';
import type { ClientAccess } from '../services/client-access-api';
import { useHydrated } from '../../../shared/hooks/use-hydrated';
function invitationSubscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  window.addEventListener('lancelio:invitation-changed', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('lancelio:invitation-changed', listener);
  };
}
function invitationSnapshot() {
  const hash = window.location.hash.slice(1);
  return /^[A-Za-z0-9_-]{43}$/u.test(hash) ? hash : pendingInvitation();
}
const invitationServerSnapshot = () => null;
export function ConnectionsScreen() {
  const { t } = useI18n();
  const { snapshot } = useSession();
  const invitation = useSyncExternalStore(
    invitationSubscribe,
    invitationSnapshot,
    invitationServerSnapshot,
  );
  const ready = useHydrated();
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{43}$/u.test(hash)) {
      rememberInvitation(hash);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [invitation]);
  if (snapshot.status === 'anonymous')
    return (
      <main className="connection-signin" id="main-content">
        <Brand />
        <span className="connection-icon">
          <MailOpen size={30} />
        </span>
        <h1>{t('شغلك المشترك، في مكان واحد.')}</h1>
        <p>
          {t(
            'سجّل بنفس البريد المدعو لمراجعة الدعوة. لو عندك مساحة بالفعل، هتفضل موجودة زي ما هي.',
          )}
        </p>
        <div className="connection-actions">
          <Link className="button button-primary" href="/login">
            {t('تسجيل الدخول')}
          </Link>
          <Link className="button" href="/register">
            {t('إنشاء حساب')}
          </Link>
        </div>
      </main>
    );
  return (
    <WorkspaceShell>
      {ready && snapshot.status === 'authenticated' && (
        <ConnectionList
          key={snapshot.identity.user.id}
          invitation={invitation}
          clear={() => {
            clearInvitation();
            window.dispatchEvent(new Event('lancelio:invitation-changed'));
          }}
        />
      )}
    </WorkspaceShell>
  );
}
function ConnectionList({
  invitation,
  clear,
}: {
  invitation: string | null;
  clear: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const { manager } = useSession();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof clientAccessApi.list>
  > | null>(null);
  const [linked, setLinked] = useState<ClientAccess | null>(null);
  const [error, setError] = useState(''),
    [linkError, setLinkError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const lock = useRef(false);
  async function more() {
    if (lock.current || !data?.nextCursor) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await manager.authorized((token) =>
        clientAccessApi.list(token, undefined, data.nextCursor!),
      );
      setData((previous) => ({
        ...next,
        items: [
          ...(previous?.items ?? []),
          ...next.items.filter(
            (item) => !previous?.items.some((known) => known.id === item.id),
          ),
        ],
      }));
    } catch (cause) {
      setError(clientAccessError(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    void manager
      .authorized((token) => clientAccessApi.list(token, abort.signal))
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(clientAccessError(cause));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [manager, revision]);
  useEffect(() => {
    if (!invitation) return;
    let alive = true;
    void manager
      .authorized((token) => clientAccessApi.resolve(token, invitation))
      .then((value) => {
        if (alive) {
          setLinked(value);
          setLinkError('');
        }
      })
      .catch((cause) => {
        if (alive) setLinkError(clientAccessError(cause));
      });
    return () => {
      alive = false;
    };
  }, [manager, invitation, revision]);
  async function decide(
    item: ClientAccess,
    action: 'accept' | 'decline' | 'leave',
  ) {
    if (lock.current) return;
    lock.current = true;
    if (
      action !== 'accept' &&
      !(await confirmAction(
        action === 'leave'
          ? 'هتشيل البوابة من حسابك. هتحتاج دعوة جديدة للرجوع. نكمل؟'
          : 'متأكد إنك عايز ترفض الدعوة؟',
      ))
    ) {
      lock.current = false;
      return;
    }
    setBusy(true);
    setError('');
    try {
      await manager.authorized((token) =>
        action === 'leave'
          ? clientAccessApi.leave(token, item)
          : clientAccessApi.decide(
              token,
              item,
              action === 'accept',
              linked?.id === item.id ? invitation : null,
            ),
      );
      if (linked?.id === item.id) {
        clear();
        setLinked(null);
      }
      setRevision((value) => value + 1);
      window.dispatchEvent(new Event('lancelio:connections-changed'));
    } catch (cause) {
      setError(clientAccessError(cause));
      setRevision((value) => value + 1);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const items = [
    ...(linked ? [linked] : []),
    ...(data?.items.filter((item) => item.id !== linked?.id) ?? []),
  ];
  const invites = items.filter((item) => item.state === 'pending'),
    accepted = items.filter((item) => item.state === 'accepted');
  return (
    <div className="connections-screen">
      <header className="dashboard-heading">
        <div>
          <span className="form-eyebrow">{t('أنت هنا كعميل')}</span>
          <h1>
            {t('بتتعامل معاهم')}
            <span className="greeting-dot">.</span>
          </h1>
          <p>
            {t(
              'دعواتك وبوابات متابعة شغلك مع المساحات التانية، بعيدًا عن إدارة مساحتك.',
            )}
          </p>
        </div>
        <button
          className="button"
          disabled={busy || loading}
          onClick={() => {
            setError('');
            setRevision((value) => value + 1);
          }}
        >
          <RefreshCw size={16} />
          {t('تحديث')}
        </button>
      </header>
      <div className="connections-context">
        <ShieldCheck size={22} />
        <p>
          {t(
            'مساحتك ليك. هنا بتتابع شغلك كعميل فقط، وكل مساحة بتشارك معاك بياناتك أنت.',
          )}
        </p>
        <Link href="/dashboard">
          {t('الرجوع لمساحتي')}
          <ArrowUpLeft size={17} />
        </Link>
      </div>
      {loading && <p role="status">{t('بنراجع الدعوات والبوابات…')}</p>}
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
      {linkError && (
        <div className="form-notice">
          <p role="alert">{t(linkError)}</p>
          <button
            className="text-button"
            onClick={() => {
              clear();
              setLinked(null);
              setLinkError('');
            }}
          >
            {t('تجاهل الرابط ده')}
          </button>
        </div>
      )}
      {data?.verificationRequired && (
        <p className="form-notice">
          {t(
            'افتح رابط الدعوة من بريدك، أو سجّل باستخدام Google بنفس البريد لتأكيد ملكيته.',
          )}
        </p>
      )}
      {invites.length > 0 && (
        <section className="connection-section">
          <div className="connection-section-title">
            <MailOpen size={22} />
            <h2>{t('دعوات في انتظارك')}</h2>
            <span className="connection-count">
              {invites.length.toLocaleString(intlLocale)}
            </span>
          </div>
          <div className="connections-grid">
            {invites.map((item) => (
              <article className="connection-card is-invitation" key={item.id}>
                <span className="form-eyebrow">{t('دعوة لمتابعة الشغل')}</span>
                <h3>{item.workspaceName}</h3>
                <p>{item.clientName}</p>
                <p className="connection-email" dir="auto">
                  {item.email}
                </p>
                <p>
                  {t(
                    'المتاح بعد القبول: مشاريعك وفواتيرك والمهام المشتركة معاك.',
                  )}
                </p>
                <time dateTime={item.expiresAt}>
                  {t('تقبل الدعوة قبل')}{' '}
                  {new Intl.DateTimeFormat(intlLocale, {
                    dateStyle: 'medium',
                  }).format(new Date(item.expiresAt))}
                </time>
                <div className="connection-actions">
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => void decide(item, 'accept')}
                  >
                    <Check size={17} />
                    {t('قبول الدعوة')}
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void decide(item, 'decline')}
                  >
                    <X size={17} />
                    {t('رفض')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="connection-section">
        <div className="connection-section-title">
          <Handshake size={23} />
          <h2>{t('بواباتك كعميل')}</h2>
        </div>
        {!loading && data && accepted.length === 0 ? (
          <div className="connections-empty">
            <span className="connection-icon">
              <Handshake size={30} />
            </span>
            <h3>{t('أول تعاون يبدأ بدعوة.')}</h3>
            <p>
              {t(
                'لما صاحب مساحة يدعوك وتقبل، بوابته هتظهر هنا. تقدر تفضل تدير مساحتك عادي.',
              )}
            </p>
          </div>
        ) : (
          <div className="connections-grid">
            {accepted.map((item) => (
              <article className="connection-card" key={item.id}>
                <span className="connection-status">
                  <span />
                  {t('وصول مفعّل لحسابك')}
                </span>
                <h3>{item.workspaceName}</h3>
                <p>{item.clientName}</p>
                <div className="connection-actions">
                  <Link
                    className="button button-primary"
                    href={'/connections/' + item.id}
                  >
                    {t('فتح بوابة المتابعة')}
                    <ArrowUpLeft size={17} />
                  </Link>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void decide(item, 'leave')}
                  >
                    <LogOut size={16} />
                    {t('مغادرة')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {data?.hasMore && (
        <button className="button" disabled={busy} onClick={() => void more()}>
          {t('عرض بوابات ودعوات أكتر')}
        </button>
      )}
    </div>
  );
}
export function AccountPortalScreen({ id }: { id: string }) {
  return (
    <WorkspaceShell>
      <AccountPortal key={id} id={id} />
    </WorkspaceShell>
  );
}
function AccountPortal({ id }: { id: string }) {
  const { t } = useI18n(),
    { manager } = useSession();
  const [data, setData] = useState<Awaited<
      ReturnType<typeof clientAccessApi.page>
    > | null>(null),
    [error, setError] = useState('');
  const [cursors, setCursors] = useState<{
      projects: string | null;
      invoices: string | null;
    }>({ projects: null, invoices: null }),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void manager
      .authorized((token) =>
        clientAccessApi.page(token, id, cursors, abort.signal),
      )
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) {
          setData(null);
          setError(clientAccessError(cause));
        }
      });
    return () => abort.abort();
  }, [manager, id, cursors, revision]);
  const refresh = useCallback(() => {
    setData(null);
    setError('');
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);
  return (
    <div className="connections-screen">
      <div className="connection-portal-bar">
        <Link className="text-button" href="/connections">
          {t('الرجوع للبوابات')}
        </Link>
        <span className="connection-status">
          <ShieldCheck size={16} />
          {t('عرض العميل فقط')}
        </span>
        <button className="text-button" onClick={refresh}>
          <RefreshCw size={16} />
          {t('تحديث')}
        </button>
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      ) : data ? (
        <PortalContent
          page={data}
          onNext={(kind, cursor) => {
            setData(null);
            setCursors((previous) => ({ ...previous, [kind]: cursor }));
          }}
          onFirst={() => {
            setData(null);
            setCursors({ projects: null, invoices: null });
          }}
        />
      ) : (
        <p role="status">{t('بنفتح البوابة…')}</p>
      )}
    </div>
  );
}
import { PortalDocument as PortalContent } from './portal-document';
