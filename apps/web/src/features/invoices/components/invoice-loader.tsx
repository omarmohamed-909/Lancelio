'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from '../../auth/components/session-provider';
import { invoiceApi, invoiceError } from '../services/invoice-api';
import type { Invoice } from '../schemas/invoice';
export function InvoiceLoader({
  id,
  children,
}: {
  id: string;
  children: (invoice: Invoice, reload: () => void) => ReactNode;
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
  children: (invoice: Invoice, reload: () => void) => ReactNode;
}) {
  const { t } = useI18n();
  const { manager } = useSession();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void manager
      .authorized((token) => invoiceApi.read(token, id, controller.signal))
      .then((result) => {
        if (!controller.signal.aborted) setInvoice(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(invoiceError(cause));
      });
    return () => controller.abort();
  }, [manager, id]);
  if (error)
    return (
      <section className="proposal-state">
        <h1>{t('مش قادرين نفتح الفاتورة')}</h1>
        <p role="alert">{t(error)}</p>
        <button className="button" onClick={reload}>
          {t('إعادة المحاولة')}{' '}
        </button>
        <Link href="/invoices">{t('الرجوع للفواتير')}</Link>
      </section>
    );
  if (!invoice)
    return (
      <p role="status" className="proposal-state">
        {t('بنفتح ورقة الفاتورة…')}{' '}
      </p>
    );
  return children(invoice, reload);
}
