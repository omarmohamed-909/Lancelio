'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useCallback, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { BrandMark } from '../../../components/ui/brand';
import { LanguageSelect } from '../../../components/language/language-select';
import {
  usePublicDocumentLocation,
  useGrantedDocument,
} from '../../../shared/hooks/use-public-document';
import { portalApi } from '../services/portal-api';
import type { PortalCursors } from '../schemas/portal';
import { PortalDocument } from './portal-document';
export function PublicPortalScreen() {
  const { t } = useI18n();
  const { token, revision, reload } = usePublicDocumentLocation();
  return (
    <main
      id="main-content"
      className="public-proposal-shell public-portal-shell"
    >
      <header className="public-proposal-brand">
        <span className="document-wordmark" aria-label="Lancelio">
          <BrandMark />
          <span lang="en" dir="ltr">
            lancelio.
          </span>
        </span>
        <LanguageSelect />
        <span>
          <LockKeyhole size={14} aria-hidden="true" />
          {t('بوابة متابعة')}{' '}
        </span>
      </header>
      {token === null ? (
        <p role="status" className="proposal-state">
          {t('بنفتح البوابة…')}{' '}
        </p>
      ) : (
        <Reader key={token + ':' + revision} token={token} reload={reload} />
      )}
      <footer className="public-proposal-footer">
        {t('كل خطوة واضحة، من الاتفاق للتسليم.')}{' '}
      </footer>
    </main>
  );
}
function Reader({ token, reload }: { token: string; reload: () => void }) {
  const [cursors, setCursors] = useState<PortalCursors>({
    projects: null,
    invoices: null,
  });
  return (
    <Load
      key={JSON.stringify(cursors)}
      token={token}
      cursors={cursors}
      reload={reload}
      onNext={(kind, cursor) =>
        setCursors((previous) => ({ ...previous, [kind]: cursor }))
      }
    />
  );
}
function Load({
  token,
  cursors,
  reload,
  onNext,
}: {
  token: string;
  cursors: PortalCursors;
  reload: () => void;
  onNext: (kind: 'projects' | 'invoices', cursor: string) => void;
}) {
  const { t, intlLocale } = useI18n();
  const read = useCallback(
    (secret: string, signal: AbortSignal) =>
      portalApi.readPublic(secret, cursors, signal),
    [cursors],
  );
  const { data, failure } = useGrantedDocument(token, reload, read);
  if (failure)
    return (
      <section className="proposal-state public-proposal-unavailable">
        <LockKeyhole size={28} />
        <h1>
          {failure === 'unavailable'
            ? t('الرابط غير متاح')
            : t('مش قادرين نفتح البوابة دلوقتي')}
        </h1>
        <p role="alert">
          {failure === 'unavailable'
            ? t('ممكن صلاحيته انتهت أو صاحب المساحة ألغاه. اطلب منه رابط جديد.')
            : t('راجع اتصالك وحاول تاني.')}
        </p>
        {failure === 'network' && (
          <button className="button" onClick={reload}>
            {t('إعادة المحاولة')}{' '}
          </button>
        )}
      </section>
    );
  if (!data)
    return (
      <p role="status" className="proposal-state">
        {t('بنفتح البوابة…')}{' '}
      </p>
    );
  return (
    <>
      <p className="portal-validity">
        {t('الرابط صالح حتى')}{' '}
        {new Intl.DateTimeFormat(intlLocale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(data.expiresAt))}
      </p>
      <PortalDocument page={data} onNext={onNext} onFirst={reload} />
    </>
  );
}
