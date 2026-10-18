'use client';
import { useI18n } from '../../../i18n/language-provider';

import { notifySuccess } from '../../../components/ui/feedback';
import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Building2, LoaderCircle } from 'lucide-react';
import { useSession } from '../../auth/components/session-provider';
import { displayNameSchema } from '../../auth/schemas/forms';
import { ApiError, errorMessage } from '../../auth/services/auth-api';
import type { Identity } from '../../auth/services/auth-api';
import { workspaceSettingsApi } from '../services/workspace-settings-api';
import type { WorkspaceSettings } from '../services/workspace-settings-api';
import { useUnsavedProfile } from '../hooks/use-unsaved-profile';

type Mode =
  | 'loading'
  | 'load-error'
  | 'ready'
  | 'saving'
  | 'review-required'
  | 'reading'
  | 'review';
const roles = {
  owner: 'مالك المساحة',
  admin: 'مدير المساحة',
  member: 'عضو المساحة',
};

export function WorkspaceSettingsForm({ identity }: { identity: Identity }) {
  const { t } = useI18n();
  const { manager } = useSession();
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [current, setCurrent] = useState<WorkspaceSettings | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const alive = useRef(false);
  const lock = useRef(false);
  const pending = mode === 'loading' || mode === 'saving' || mode === 'reading';
  const dirty = workspace?.canEdit === true && name !== workspace.name;
  const canEdit =
    workspace?.canEdit === true && identity.membership.role === 'owner';
  useUnsavedProfile(
    dirty ||
      mode === 'saving' ||
      mode === 'review-required' ||
      mode === 'review',
  );

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const revision = manager.getIdentityRevision();
    void manager
      .authorized((token) =>
        workspaceSettingsApi.read(token, controller.signal),
      )
      .then((value) => {
        if (!alive.current || controller.signal.aborted) return;
        setWorkspace(value);
        setName(value.name);
        setMode('ready');
        manager.updateWorkspaceIdentity(
          value,
          identity.user.id,
          false,
          revision,
        );
      })
      .catch((reason: unknown) => {
        if (!alive.current || controller.signal.aborted) return;
        setMode('load-error');
        setError(errorMessage(reason));
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [manager, identity.user.id]);

  useEffect(() => {
    if (notice) status.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (fieldError && !pending) input.current?.focus();
  }, [fieldError, pending]);

  async function readCurrent() {
    if (lock.current) return;
    lock.current = true;
    const revision = manager.getIdentityRevision();
    setMode('reading');
    setError('');
    try {
      const value = await manager.authorized((token) =>
        workspaceSettingsApi.read(token),
      );
      if (!alive.current) return;
      manager.updateWorkspaceIdentity(value, identity.user.id, false, revision);
      if (workspace && value.canEdit) {
        setCurrent(value);
        setMode('review');
      } else {
        setWorkspace(value);
        setName(value.name);
        setMode('ready');
        if (workspace && !value.canEdit)
          setNotice(
            t('صلاحية التعديل اتغيّرت. اسم المساحة الحالي ظاهر للقراءة.'),
          );
      }
    } catch (reason: unknown) {
      if (!alive.current) return;
      setMode(workspace ? 'review-required' : 'load-error');
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || mode !== 'ready' || !workspace || !canEdit) return;
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? t('راجع اسم المساحة.'));
      input.current?.focus();
      return;
    }
    if (parsed.data === workspace.name) {
      setName(workspace.name);
      return;
    }
    lock.current = true;
    const revision = manager.getIdentityRevision();
    setMode('saving');
    setError('');
    setFieldError('');
    setNotice('');
    try {
      const value = await manager.authorized((token) =>
        workspaceSettingsApi.update(token, parsed.data, workspace.version),
      );
      if (!alive.current) return;
      setWorkspace(value);
      setName(value.name);
      setMode('ready');
      manager.updateWorkspaceIdentity(value, identity.user.id, true, revision);
      setNotice(t('اسم المساحة اتحدّث. مستنداتك الصادرة محتفظة ببياناتها.'));
      notifySuccess(t('اسم مساحة العمل اتحدّث.'));
    } catch (reason: unknown) {
      if (!alive.current) return;
      if (reason instanceof ApiError && reason.status === 422) {
        setMode('ready');
        setFieldError(t('اسم المساحة لازم يكون من حرفين إلى ١٠٠ حرف.'));
      } else {
        setMode('review-required');
        setError(
          reason instanceof ApiError && reason.code === 'WORKSPACE_CONFLICT'
            ? t(
                'اسم المساحة اتغيّر من مكان تاني. اقرأ الحالة الحالية قبل ما تحفظ.',
              )
            : reason instanceof ApiError && reason.status === 403
              ? t('صلاحية التعديل اتغيّرت. اقرأ الحالة الحالية لمراجعة دورك.')
              : t(
                  'مش قادرين نأكد نتيجة الحفظ. اقرأ الحالة الحالية؛ تعديلك المكتوب لسه هنا.',
                ),
        );
      }
    } finally {
      lock.current = false;
    }
  }

  function resolve(useCurrent: boolean) {
    if (!current || lock.current) return;
    setWorkspace(current);
    if (useCurrent) setName(current.name);
    setCurrent(null);
    setMode('ready');
    setError('');
    setFieldError('');
    setNotice(
      useCurrent
        ? t('اعتمدنا اسم المساحة الحالي.')
        : t('تعديلك موجود للمراجعة. احفظه لما تكون جاهز.'),
    );
    if (!useCurrent) requestAnimationFrame(() => input.current?.focus());
  }

  return (
    <section
      className="workspace-settings profile-sheet"
      aria-labelledby="workspace-settings-title"
      aria-busy={pending}
    >
      <header className="profile-sheet-heading">
        <span className="profile-monogram" aria-hidden="true">
          <Building2 size={22} />
        </span>
        <div>
          <h2 id="workspace-settings-title">{t('مساحة العمل')}</h2>
          <p>{t('اسم يجمع شغلك وفريقك في مكان واحد.')}</p>
        </div>
      </header>
      {mode === 'loading' && (
        <LoadingPlaceholder
          label={t('بنحمّل بيانات المساحة…')}
          kind="form"
          count={1}
        />
      )}
      {mode === 'load-error' && (
        <div className="profile-recovery">
          <p role="alert">{t(error)}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void readCurrent()}
          >
            {t('حاول تحميل المساحة تاني')}{' '}
          </button>
        </div>
      )}
      {workspace && (
        <>
          <p className="workspace-settings-role">
            {t('دورك:')} {t(roles[workspace.role])}
          </p>
          {!canEdit && (
            <div className="workspace-settings-readonly">
              <span>{t('اسم مساحة العمل')}</span>
              <p>{workspace.name}</p>
              <small>{t('تعديل اسم المساحة متاح للمالك فقط.')}</small>
            </div>
          )}
          {canEdit && (
            <form
              aria-label={t('تعديل مساحة العمل')}
              noValidate
              onSubmit={(event) => void save(event)}
            >
              <div className="field">
                <label htmlFor="workspace-settings-name">
                  {t('اسم مساحة العمل')}
                </label>
                <input
                  id="workspace-settings-name"
                  ref={input}
                  value={name}
                  maxLength={200}
                  autoComplete="organization"
                  disabled={pending}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={
                    'workspace-settings-hint' +
                    (fieldError ? ' workspace-settings-error' : '')
                  }
                  onChange={(event) => {
                    setName(event.target.value);
                    setFieldError('');
                    setNotice('');
                  }}
                />
                <p id="workspace-settings-hint" className="profile-hint">
                  {t(
                    'من حرفين إلى ١٠٠ حرف. اسم المساحة مستقل عن اسمك الشخصي.',
                  )}{' '}
                </p>
                {fieldError && (
                  <p
                    id="workspace-settings-error"
                    className="field-error"
                    role="alert"
                  >
                    {t(fieldError)}
                  </p>
                )}
              </div>
              <div className="profile-actions">
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={mode !== 'ready' || !dirty}
                >
                  {mode === 'saving' ? (
                    <LoaderCircle
                      className="spin"
                      size={17}
                      aria-hidden="true"
                    />
                  ) : (
                    <Check size={17} aria-hidden="true" />
                  )}
                  {mode === 'saving'
                    ? t('بنحفظ اسم المساحة…')
                    : t('حفظ اسم المساحة')}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={mode !== 'ready' || !dirty}
                  onClick={() => {
                    setName(workspace.name);
                    setFieldError('');
                    setNotice('');
                    input.current?.focus();
                  }}
                >
                  {t('تراجع عن تعديل المساحة')}{' '}
                </button>
              </div>
            </form>
          )}
          {(mode === 'review-required' ||
            mode === 'reading' ||
            mode === 'review') && (
            <div className="profile-recovery">
              {error && <p role="alert">{t(error)}</p>}
              {mode !== 'review' && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={pending}
                  onClick={() => void readCurrent()}
                >
                  {mode === 'reading'
                    ? t('بنقرأ الحالة الحالية…')
                    : t('اقرأ حالة المساحة الحالية')}
                </button>
              )}
              {mode === 'review' && current && (
                <>
                  <h3>{t('راجع اسم المساحة الحالي')}</h3>
                  <p>
                    {t('الاسم المحفوظ الآن:')} <strong>{current.name}</strong>
                  </p>
                  <p>
                    {t(
                      'تعديلك المكتوب لسه موجود فوق. اختار النسخة اللي تكمل بيها.',
                    )}{' '}
                  </p>
                  <div className="profile-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => resolve(true)}
                    >
                      {t('اعتمد اسم المساحة الحالي')}{' '}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => resolve(false)}
                    >
                      {t('احتفظ بتعديل المساحة للمراجعة')}{' '}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {notice && (
            <p
              role="status"
              className="profile-success"
              ref={status}
              tabIndex={-1}
            >
              {t(notice)}
            </p>
          )}
          <p className="profile-footnote">
            {t(
              'تغيير الاسم يحافظ على روابطك، وعروض الأسعار والفواتير والاتفاقات الصادرة.',
            )}{' '}
          </p>
        </>
      )}
    </section>
  );
}
