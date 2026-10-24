'use client';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '../../auth/components/session-provider';
import { WorkspaceShell } from '../../workspace/components/workspace-shell';
import { useOwnerPortal } from '../hooks/use-owner-portal';
import { PortalDocument } from './portal-document';
import { OwnerClientInvitation } from './owner-client-invitation';
export function OwnerPortalScreen({ clientId }: { clientId: string }) {
  return (
    <WorkspaceShell>
      <Identity clientId={clientId} />
    </WorkspaceShell>
  );
}
function Identity({ clientId }: { clientId: string }) {
  const { snapshot } = useSession();
  return snapshot.status === 'authenticated' ? (
    <Manage
      key={snapshot.identity.workspace.id + ':' + clientId}
      clientId={clientId}
    />
  ) : null;
}
function Manage({ clientId }: { clientId: string }) {
  const { t, intlLocale } = useI18n();
  const portal = useOwnerPortal(clientId),
    [days, setDays] = useState(7),
    [copied, setCopied] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const labels = {
    active: t('الرابط شغال'),
    expired: t('صلاحية الرابط انتهت'),
    revoked: t('الرابط ملغي'),
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(portal.link);
      setCopied(t('الرابط اتنسخ. جاهز تبعته للعميل.'));
    } catch {
      input.current?.focus();
      input.current?.select();
      setCopied(t('حددنا الرابط. انسخه من الحقل.'));
    }
  }
  return (
    <>
      <Link className="text-button" href="/clients">
        {t('الرجوع لدفتر العملاء')}{' '}
      </Link>
      <div className="dashboard-heading">
        <div>
          <span className="form-eyebrow">{t('المشاركة تبدأ بمراجعة')}</span>
          <h1>
            {t('بوابة متابعة العميل')}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{t('راجع اللي هيظهر، وبعدها أنشئ الرابط وابعته للعميل بنفسك.')}</p>
        </div>
      </div>
      <OwnerClientInvitation clientId={clientId} />
      <section
        className="portal-controls"
        aria-label={t('إدارة رابط المتابعة')}
      >
        <div className="portal-record-heading">
          <h2>{portal.state?.client.name ?? t('حالة البوابة')}</h2>
          <button
            className="button"
            disabled={portal.pending}
            onClick={() => {
              setCopied('');
              void portal.reload();
            }}
          >
            {t('قراءة حالة البوابة')}{' '}
          </button>
        </div>
        {portal.pending && <p role="status">{t('بنراجع البوابة…')}</p>}
        {portal.error && (
          <p className="form-error" role="alert">
            {t(portal.error)}
          </p>
        )}
        {portal.state && (
          <>
            <p className="portal-state">
              {portal.state.share
                ? t(labels[portal.state.share.state])
                : t('لسه مفيش رابط للعميل')}
              {portal.state.share && (
                <>
                  {' '}
                  {t('· صالح حتى')}{' '}
                  {new Intl.DateTimeFormat(intlLocale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(portal.state.share.expiresAt))}
                </>
              )}
            </p>
            {portal.state.client.archived && (
              <p className="form-notice">
                {t('العميل مؤرشف؛ بوابته غير متاحة.')}
              </p>
            )}
          </>
        )}
        <p>
          {t(
            'الرابط يشارك كل مشاريع العميل وفواتيره الصادرة الحالية والجديدة، وأرصدة الدفعات المسجلة. المهام الظاهرة للعميل فقط هتظهر. ملاحظات العميل ووسائل التواصل وتفاصيل سجل الدفعات بتفضل خاصة.',
          )}{' '}
        </p>
        <label className="portal-review">
          <input
            type="checkbox"
            checked={portal.reviewed}
            disabled={
              portal.pending ||
              portal.blocked ||
              !portal.page ||
              portal.state?.client.archived
            }
            onChange={(event) => portal.setReviewed(event.target.checked)}
          />
          {t('راجعت المعاينة وموافق أشارك نطاق البوابة ده')}{' '}
        </label>
        <div className="portal-share-actions">
          <div>
            <label htmlFor="portal-days">{t('صلاحية الرابط')}</label>
            <Select
              id="portal-days"
              value={days}
              disabled={portal.pending || portal.blocked || !portal.state}
              onValueChange={(value) => setDays(Number(value))}
            >
              {[1, 7, 14, 30].map((day) => (
                <option key={day} value={day}>
                  {day === 1 ? t('يوم واحد') : day + t(' أيام')}
                </option>
              ))}
            </Select>
          </div>
          <button
            className="button button-primary"
            disabled={
              portal.pending ||
              portal.blocked ||
              !portal.reviewed ||
              !portal.page ||
              !portal.state ||
              portal.state.client.archived
            }
            onClick={() => {
              setCopied('');
              void portal.mutate('issue', days);
            }}
          >
            {portal.state?.share
              ? t('تجديد رابط المتابعة')
              : t('إنشاء رابط المتابعة')}
          </button>
          {portal.state?.share && portal.state.share.state !== 'revoked' && (
            <button
              className="button"
              disabled={portal.pending || portal.blocked}
              onClick={() => {
                setCopied('');
                void portal.mutate('revoke', days);
              }}
            >
              {t('إلغاء رابط المتابعة')}{' '}
            </button>
          )}
        </div>
        {portal.link && (
          <div className="portal-link">
            <label htmlFor="portal-link">{t('الرابط الجديد')}</label>
            <input
              id="portal-link"
              ref={input}
              readOnly
              dir="ltr"
              value={portal.link}
            />
            <button className="button" onClick={() => void copy()}>
              {t('نسخ الرابط')}{' '}
            </button>
            <a
              className="text-button"
              href={portal.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('فتح بوابة العميل')}{' '}
            </a>
          </div>
        )}
        {copied && <p role="status">{t(copied)}</p>}
      </section>
      {portal.page && (
        <section
          className="portal-preview"
          aria-label={t('معاينة بوابة العميل')}
        >
          <div className="portal-preview-label">
            {t('معاينة خاصة / ده المحتوى اللي يقدر العميل يشوفه')}{' '}
          </div>
          <PortalDocument
            preview
            page={portal.page}
            onNext={(kind, cursor) =>
              void portal.reload({
                projects: kind === 'projects' ? cursor : null,
                invoices: kind === 'invoices' ? cursor : null,
              })
            }
            onFirst={() => void portal.reload()}
          />
        </section>
      )}
    </>
  );
}
