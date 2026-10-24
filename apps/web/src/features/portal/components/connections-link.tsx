'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Handshake } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { useI18n } from '../../../i18n/language-provider';
import { clientAccessApi } from '../services/client-access-api';
export function ConnectionsLink({ onNavigate }: { onNavigate: () => void }) {
  const { t, intlLocale } = useI18n(),
    { manager } = useSession(),
    pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let active = false;
    const update = async () => {
      if (document.hidden || active) return;
      active = true;
      try {
        const data = await manager.authorized((token) =>
          clientAccessApi.list(token, abort.signal),
        );
        if (!abort.signal.aborted)
          setCount(
            data.items.filter((item) => item.state === 'pending').length,
          );
      } catch {
        /* Navigation remains available during a connection failure. */
      } finally {
        active = false;
      }
    };
    void update();
    const interval = window.setInterval(() => void update(), 60000);
    window.addEventListener('focus', update);
    window.addEventListener('lancelio:connections-changed', update);
    return () => {
      abort.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', update);
      window.removeEventListener('lancelio:connections-changed', update);
    };
  }, [manager, pathname]);
  return (
    <Link
      className={
        'nav-item' + (pathname.startsWith('/connections') ? ' active' : '')
      }
      href="/connections"
      onClick={onNavigate}
      aria-current={pathname.startsWith('/connections') ? 'page' : undefined}
    >
      <Handshake size={19} />
      {t('بتتعامل معاهم')}
      {count > 0 && (
        <span
          className="connection-nav-count"
          aria-label={t('دعوات في انتظارك')}
        >
          {count.toLocaleString(intlLocale)}
        </span>
      )}
    </Link>
  );
}
