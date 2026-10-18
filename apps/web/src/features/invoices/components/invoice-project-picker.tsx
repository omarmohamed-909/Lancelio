'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { projectApi, projectError } from '../../projects/services/project-api';
import type { ProjectSummary } from '../../projects/schemas/project';
export function InvoiceProjectPicker({
  clientId,
  retained,
  value,
  onChange,
}: {
  clientId: string;
  retained?: { id: string; title: string; clientId: string };
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { manager } = useSession();
  const [revision, setRevision] = useState(0);
  return (
    <Projects
      key={clientId + ':' + revision}
      manager={manager}
      clientId={clientId}
      {...(retained ? { retained } : {})}
      value={value}
      onChange={onChange}
      reload={() => setRevision((n) => n + 1)}
    />
  );
}
function Projects({
  manager,
  clientId,
  retained,
  value,
  onChange,
  reload,
}: {
  manager: ReturnType<typeof useSession>['manager'];
  clientId: string;
  retained?: { id: string; title: string; clientId: string };
  value: string | null;
  onChange: (id: string | null) => void;
  reload: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ProjectSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [pending, setPending] = useState(true),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void manager
      .authorized((token) =>
        projectApi.list(token, 'all', undefined, abort.signal),
      )
      .then((page) => {
        if (!abort.signal.aborted) {
          setRows(page.items.filter((row) => row.client.id === clientId));
          setCursor(page.nextCursor);
        }
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setError(projectError(cause));
      })
      .finally(() => {
        if (!abort.signal.aborted) setPending(false);
      });
    return () => abort.abort();
  }, [manager, clientId]);
  async function more() {
    if (!cursor || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const page = await manager.authorized((token) =>
        projectApi.list(token, 'all', cursor, controller.current?.signal),
      );
      if (!controller.current?.signal.aborted) {
        setRows((previous) => [
          ...previous,
          ...page.items.filter((row) => row.client.id === clientId),
        ]);
        setCursor(page.nextCursor);
      }
    } catch (cause: unknown) {
      if (!controller.current?.signal.aborted) setError(projectError(cause));
    } finally {
      busy.current = false;
      if (!controller.current?.signal.aborted) setPending(false);
    }
  }
  return (
    <div className="proposal-field invoice-project-picker">
      <label htmlFor="invoice-project">
        {t('المشروع')} <span>{t('اختياري')}</span>
      </label>
      <Select
        id="invoice-project"
        value={value ?? ''}
        onValueChange={(value) => onChange(value || null)}
      >
        <option value="">{t('فاتورة مستقلة بدون مشروع')}</option>
        {retained &&
          retained.clientId === clientId &&
          !rows.some((row) => row.id === retained.id) && (
            <option value={retained.id}>{retained.title}</option>
          )}
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.title}
          </option>
        ))}
      </Select>
      <p className="field-help">
        {t('بنختار من مشاريع نفس العميل. البنود والأسعار بتكتبها بنفسك.')}{' '}
      </p>
      {pending && <p role="status">{t('بنحمّل المشاريع…')}</p>}
      {error && (
        <p role="alert">
          {t(error)}{' '}
          <button
            type="button"
            className="proposal-text-button"
            onClick={cursor ? () => void more() : reload}
          >
            {t('إعادة تحميل المشاريع')}{' '}
          </button>
        </p>
      )}
      {cursor && (
        <button
          type="button"
          className="proposal-text-button"
          disabled={pending}
          onClick={() => void more()}
        >
          {t('تحميل باقي المشاريع')}{' '}
        </button>
      )}
    </div>
  );
}
