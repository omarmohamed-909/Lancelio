'use client';
import { useI18n } from '../../../i18n/language-provider';

import type { ReactNode } from 'react';
import { NotificationProvider } from '../../notifications/components/notification-provider';
import { NotificationLink } from '../../notifications/components/notification-link';
import { ConnectionsLink } from '../../portal/components/connections-link';
import { WorkspaceActions } from './workspace-actions';
import { ThemeToggle } from '../../../components/theme/theme-toggle';
import { LanguageSelect } from '../../../components/language/language-select';

import {
  ChevronLeft,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Brand } from '../../../components/ui/brand';
import { ViewportMotion } from '../../../components/ui/viewport-motion';
import { useSession } from '../../auth/components/session-provider';
import { errorMessage } from '../../auth/services/auth-api';
import type { Identity } from '../../auth/services/auth-api';
import { useMobileNavigation } from '../../dashboard/hooks/use-mobile-navigation';

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { manager, snapshot } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (snapshot.status === 'anonymous') router.replace('/login');
  }, [snapshot.status, router]);

  if (snapshot.status === 'loading' || snapshot.status === 'anonymous') {
    return (
      <main id="main-content" className="session-state" aria-live="polite">
        <Brand />
        <LoaderCircle className="spin" size={28} />
        <p>{t('بنجهّز مساحتك…')}</p>
      </main>
    );
  }
  if (snapshot.status === 'unavailable') {
    return (
      <main id="main-content" className="session-state">
        <Brand />
        <h1>{t('مش قادرين نفتح مساحتك حاليًا.')}</h1>
        <p role="alert">{t(snapshot.message)}</p>
        <button
          className="button button-primary"
          onClick={() => {
            void manager.restore();
          }}
        >
          {t('إعادة الاتصال')}{' '}
        </button>
        <Link href="/login">{t('الرجوع لتسجيل الدخول')}</Link>
      </main>
    );
  }
  return (
    <NotificationProvider
      key={snapshot.identity.workspace.id + ':' + snapshot.identity.user.id}
    >
      <AuthenticatedWorkspace identity={snapshot.identity}>
        {children}
      </AuthenticatedWorkspace>
    </NotificationProvider>
  );
}

function AuthenticatedWorkspace({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { manager } = useSession();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'logout' | 'refresh' | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { sidebarRef, triggerRef, isMobile } = useMobileNavigation(
    menuOpen,
    closeMenu,
  );

  const navigationOpen = menuOpen && isMobile;
  const role = {
    owner: t('مالك المساحة'),
    admin: t('مدير المساحة'),
    member: t('عضو المساحة'),
  }[identity.membership.role];

  async function action(kind: 'logout' | 'refresh') {
    if (busy) return;
    setBusy(kind);
    setMessage('');
    try {
      if (kind === 'logout') {
        await manager.logout();
        router.replace('/login');
      } else await manager.reloadIdentity();
    } catch (error: unknown) {
      if (kind === 'logout') closeMenu();
      if (manager.getSnapshot().status === 'authenticated')
        setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="workspace-shell">
      <button
        className={`sidebar-scrim${navigationOpen ? ' is-open' : ''}`}
        aria-label={t('إغلاق القائمة')}
        aria-hidden={!navigationOpen}
        tabIndex={-1}
        onClick={closeMenu}
      />
      <aside
        id="workspace-navigation"
        ref={sidebarRef}
        inert={isMobile && !navigationOpen}
        aria-hidden={isMobile && !navigationOpen ? true : undefined}
        className={`workspace-sidebar${navigationOpen ? ' is-open' : ''}`}
        role={navigationOpen ? 'dialog' : undefined}
        aria-modal={navigationOpen ? true : undefined}
        aria-label={t('قائمة مساحة العمل')}
      >
        <div className="sidebar-brand">
          <Brand light />
          <button
            className="icon-button sidebar-close"
            data-nav-close
            onClick={closeMenu}
            aria-label={t('إغلاق القائمة')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            {Array.from(identity.workspace.name)[0]}
          </span>
          <div>
            <strong title={identity.workspace.name}>
              {identity.workspace.name}
            </strong>
            <span>{t('مساحة العمل')}</span>
          </div>
        </div>
        <div className="sidebar-navigation">
          <div className="sidebar-language">
            <LanguageSelect />
          </div>
          <span className="nav-label">{t('أدوات العمل')}</span>
          <nav aria-label={t('التنقل الرئيسي')}>
            <ConnectionsLink onNavigate={closeMenu} />
            <Link
              className={`nav-item${pathname === '/dashboard' ? ' active' : ''}`}
              onClick={closeMenu}
              href="/dashboard"
              aria-current={pathname === '/dashboard' ? 'page' : undefined}
            >
              <LayoutDashboard size={19} />
              {t('نظرة عامة')}{' '}
              {pathname === '/dashboard' && <span className="nav-dot" />}
            </Link>
            <Link
              className={`nav-item${pathname === '/clients' ? ' active' : ''}`}
              href="/clients"
              aria-current={pathname === '/clients' ? 'page' : undefined}
              onClick={closeMenu}
            >
              <Users size={19} />
              {t('العملاء')}{' '}
            </Link>
            <Link
              className={`nav-item${pathname.startsWith('/proposals') ? ' active' : ''}`}
              href="/proposals"
              aria-current={
                pathname.startsWith('/proposals') ? 'page' : undefined
              }
              onClick={closeMenu}
            >
              <FileText size={19} />
              {t('عروض الأسعار')}{' '}
            </Link>
            <Link
              className={
                'nav-item' + (pathname.startsWith('/projects') ? ' active' : '')
              }
              href="/projects"
              onClick={closeMenu}
              aria-current={
                pathname.startsWith('/projects') ? 'page' : undefined
              }
            >
              <FolderKanban size={19} />
              {t('المشاريع')}{' '}
            </Link>
            <Link
              className={
                'nav-item' + (pathname.startsWith('/invoices') ? ' active' : '')
              }
              href="/invoices"
              aria-current={
                pathname.startsWith('/invoices') ? 'page' : undefined
              }
              onClick={closeMenu}
            >
              <Wallet size={19} />
              {t('الفواتير')}{' '}
            </Link>
            <Link
              className={
                'nav-item' + (pathname.startsWith('/settings') ? ' active' : '')
              }
              href="/settings"
              onClick={closeMenu}
              aria-current={
                pathname.startsWith('/settings') ? 'page' : undefined
              }
            >
              <Settings size={19} />
              {t('الإعدادات')}{' '}
            </Link>
          </nav>
        </div>
        <div className="sidebar-note" aria-hidden="true">
          <span className="sidebar-note-rule" />
          <p>
            {t('مكان للتفاصيل.')} <br />
            {t('ومساحة للشغل.')}{' '}
          </p>
          <span lang="en" dir="ltr">
            LANCELIO / YOUR WORKSPACE
          </span>
        </div>
        <div className="sidebar-user">
          <Link
            className="sidebar-profile-link"
            href="/settings"
            aria-label={t('الملف الشخصي: {0}', [identity.user.name])}
            aria-current={pathname === '/settings' ? 'page' : undefined}
            onClick={closeMenu}
          >
            <span className="user-avatar" aria-hidden="true">
              {Array.from(identity.user.name)[0]}
            </span>
            <div>
              <strong>{identity.user.name}</strong>
              <span>{role}</span>
            </div>
          </Link>
          <button
            className="icon-button"
            aria-label={t('تسجيل الخروج')}
            data-leaves-page
            title={t('تسجيل الخروج')}
            disabled={busy !== null}
            onClick={() => {
              void action('logout');
            }}
          >
            {busy === 'logout' ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <LogOut size={18} />
            )}
          </button>
        </div>
      </aside>
      <div className="workspace-main" inert={navigationOpen}>
        <header className="workspace-topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              ref={triggerRef}
              aria-controls="workspace-navigation"
              aria-label={t('فتح القائمة')}
              aria-expanded={navigationOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>{t('مساحة العمل')}</span>
            <ChevronLeft size={14} />
            <strong>
              {pathname.startsWith('/connections')
                ? t('بتتعامل معاهم')
                : pathname === '/clients'
                  ? t('العملاء')
                  : pathname.startsWith('/proposals')
                    ? t('عروض الأسعار')
                    : pathname.startsWith('/projects')
                      ? t('المشاريع')
                      : pathname.startsWith('/invoices')
                        ? t('الفواتير')
                        : pathname === '/notifications'
                          ? t('الإشعارات')
                          : pathname.startsWith('/settings')
                            ? t('الإعدادات')
                            : t('نظرة عامة')}
            </strong>
          </div>
          <WorkspaceActions />
          <NotificationLink />
          <ThemeToggle />
          <button
            className="icon-button refresh-button"
            aria-label={t('تحديث بيانات المساحة')}
            title={t('تحديث بيانات المساحة')}
            disabled={busy !== null}
            onClick={() => {
              void action('refresh');
            }}
          >
            {busy === 'refresh' ? (
              <LoaderCircle className="spin" size={19} />
            ) : (
              <RefreshCw size={19} />
            )}
          </button>
          <span className="private-badge">
            <ShieldCheck size={15} />
            {t('مساحة خاصة')}{' '}
          </span>
        </header>
        <main id="main-content" className="dashboard-content">
          {message && (
            <div className="form-notice" role="alert">
              {t(message)}
            </div>
          )}
          <ViewportMotion>{children}</ViewportMotion>
        </main>
      </div>
    </div>
  );
}
