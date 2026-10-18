'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from '../../auth/components/session-provider';
import { proposalApi, proposalError } from '../services/proposal-api';
import type { Proposal } from '../schemas/proposal';
export function ProposalLoader({
  id,
  children,
}: {
  id: string;
  children: (proposal: Proposal, reload: () => void) => ReactNode;
}) {
  const { snapshot } = useSession();
  const [revision, setRevision] = useState(0);
  if (snapshot.status !== 'authenticated') return null;
  return (
    <Load
      key={snapshot.identity.workspace.id + ':' + id + ':' + revision}
      id={id}
      reload={() => setRevision((value) => value + 1)}
    >
      {children}
    </Load>
  );
}
function Load({
  id,
  reload,
  children,
}: {
  id: string;
  reload: () => void;
  children: (proposal: Proposal, reload: () => void) => ReactNode;
}) {
  const { t } = useI18n();
  const { manager } = useSession();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void manager
      .authorized((token) => proposalApi.read(token, id, controller.signal))
      .then((result) => {
        if (!controller.signal.aborted) setProposal(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(proposalError(cause));
      });
    return () => controller.abort();
  }, [manager, id]);
  if (error)
    return (
      <section className="proposal-state">
        <h1>{t('مش قادرين نفتح العرض')}</h1>
        <p role="alert">{t(error)}</p>
        <button className="button" onClick={reload}>
          {t('إعادة المحاولة')}{' '}
        </button>
        <Link href="/proposals">{t('الرجوع للعروض')}</Link>
      </section>
    );
  if (!proposal)
    return (
      <p role="status" className="proposal-state">
        {t('بنفتح ورقة العرض…')}{' '}
      </p>
    );
  return children(proposal, reload);
}
