'use client';
import { useI18n } from '../../../i18n/language-provider';
import Link from 'next/link';
import { Archive, Pencil } from 'lucide-react';
import type { Client } from '../schemas/client';
import type { EditorSelection } from './client-editor';
export function ClientRow({
  client,
  archived,
  onSelect,
}: {
  client: Client;
  archived: boolean;
  onSelect: (selection: EditorSelection) => void;
}) {
  const { t } = useI18n();
  return (
    <li className="client-row">
      <div className="client-person">
        <span
          className="client-avatar"
          data-tone={
            Array.from(client.name).reduce(
              (sum, letter) => sum + (letter.codePointAt(0) ?? 0),
              0,
            ) % 3
          }
          aria-hidden="true"
        >
          {Array.from(client.name)[0]}
        </span>
        <div>
          <h2>{client.name}</h2>
          <p>{client.company || t('بدون شركة مسجلة')}</p>
        </div>
      </div>
      <div className="client-contact">
        {client.email && <span dir="ltr">{client.email}</span>}
        {client.phone && <span dir="ltr">{client.phone}</span>}
        {!client.email && !client.phone && (
          <span>{t('تفاصيل التواصل لسه متضافتش')}</span>
        )}
      </div>
      <div className="client-row-actions">
        <Link
          className="text-button"
          href={'/clients/' + client.id + '/portal'}
          aria-label={t('بوابة متابعة ') + client.name}
        >
          {t('بوابة المتابعة')}{' '}
        </Link>
        <button
          className="text-button"
          aria-label={(archived ? t('عرض بيانات ') : t('تعديل ')) + client.name}
          onClick={() => onSelect({ client, archive: false })}
        >
          <Pencil size={16} />
          {archived ? t('عرض البيانات') : t('تعديل')}
        </button>
        {!archived && (
          <button
            className="icon-button archive-button"
            aria-label={t('أرشفة ') + client.name}
            title={t('أرشفة العميل')}
            onClick={() => onSelect({ client, archive: true })}
          >
            <Archive size={17} />
          </button>
        )}
      </div>
    </li>
  );
}
