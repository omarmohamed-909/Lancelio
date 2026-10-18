'use client';
import { useI18n } from '../../../i18n/language-provider';

import { notifySuccess } from '../../../components/ui/feedback';
import { LoadingPlaceholder } from '../../../components/ui/loading-placeholder';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Building2,
  Check,
  ChevronLeft,
  LoaderCircle,
  LockKeyhole,
  Languages,
  Palette,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { WorkspaceShell } from '../../workspace/components/workspace-shell';
import { useSession } from '../../auth/components/session-provider';
import { displayNameSchema } from '../../auth/schemas/forms';
import { ApiError, errorMessage } from '../../auth/services/auth-api';
import type { Identity } from '../../auth/services/auth-api';
import { profileApi } from '../services/profile-api';
import type { Profile } from '../services/profile-api';
import { useUnsavedProfile } from '../hooks/use-unsaved-profile';
import { PasswordChangeForm } from './password-change-form';
import { WorkspaceSettingsForm } from './workspace-settings-form';
import { AppearanceSettings } from './appearance-settings';
import { LanguageSettings } from './language-settings';

const sections = [
  {
    id: 'profile',
    href: '/settings',
    label: 'الملف الشخصي',
    description: 'اسمك وبيانات حسابك',
    icon: UserRound,
  },
  {
    id: 'security',
    href: '/settings/security',
    label: 'أمان الحساب',
    description: 'كلمة المرور والجلسات',
    icon: LockKeyhole,
  },
  {
    id: 'workspace',
    href: '/settings/workspace',
    label: 'مساحة العمل',
    description: 'اسم المساحة وصلاحيتك',
    icon: Building2,
  },
  {
    id: 'appearance',
    href: '/settings/appearance',
    label: 'المظهر',
    description: 'فاتح، داكن، أو حسب الجهاز',
    icon: Palette,
  },
  {
    id: 'language',
    href: '/settings/language',
    label: 'اللغة والمنطقة',
    description: 'العربية أو English',
    icon: Languages,
  },
] as const;
type SettingsSection = (typeof sections)[number]['id'];

export function SettingsScreen({
  section = 'profile',
}: {
  section?: SettingsSection;
}) {
  const { t } = useI18n();
  const { snapshot } = useSession();
  return (
    <WorkspaceShell>
      {snapshot.status === 'authenticated' && (
        <div className="settings-sections" key={snapshot.identity.user.id}>
          <div className="dashboard-heading settings-heading">
            <div>
              <span className="form-eyebrow">{t('مساحتك، على طريقتك')}</span>
              <h1 id="settings-title">{t('الإعدادات')}</h1>
              <p>{t('كل حاجة في مكانها. اختار القسم اللي حابب تعدّله.')}</p>
            </div>
          </div>
          <div className="settings-layout">
            <nav
              className="settings-navigation"
              aria-label={t('أقسام الإعدادات')}
            >
              {sections.map(({ id, href, label, description, icon: Icon }) => (
                <Link
                  key={id}
                  href={href}
                  className="settings-nav-link"
                  aria-label={t(label)}
                  aria-current={section === id ? 'page' : undefined}
                >
                  <span className="settings-nav-icon">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="settings-nav-copy">
                    <strong>{t(label)}</strong>
                    <small>{t(description)}</small>
                  </span>
                  <ChevronLeft
                    size={15}
                    className="settings-nav-arrow"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </nav>
            <div className="settings-section-frame" key={section}>
              {section === 'language' && <LanguageSettings />}
              {section === 'appearance' && <AppearanceSettings />}
              {section === 'profile' && (
                <ProfileForm identity={snapshot.identity} />
              )}
              {section === 'workspace' && (
                <WorkspaceSettingsForm
                  identity={snapshot.identity}
                  key={snapshot.identity.workspace.id}
                />
              )}
              {section === 'security' && <PasswordChangeForm />}
            </div>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}

type Mode =
  | 'loading'
  | 'load-error'
  | 'ready'
  | 'saving'
  | 'review-required'
  | 'reading'
  | 'review';

function ProfileForm({ identity }: { identity: Identity }) {
  const { t } = useI18n();
  const { manager } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [current, setCurrent] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const alive = useRef(false);
  const lock = useRef(false);
  const dirty = profile !== null && name !== profile.name;
  const pending = mode === 'saving' || mode === 'reading' || mode === 'loading';
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
      .authorized((token) => profileApi.read(token, controller.signal))
      .then((value) => {
        if (!alive.current || controller.signal.aborted) return;
        setProfile(value);
        setName(value.name);
        setMode('ready');
        manager.updateProfileIdentity(value, false, revision);
      })
      .catch((reason) => {
        if (!alive.current || controller.signal.aborted) return;
        setMode('load-error');
        setError(errorMessage(reason));
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [manager]);

  useEffect(() => {
    if (notice) status.current?.focus();
  }, [notice]);

  async function readCurrent() {
    if (lock.current) return;
    lock.current = true;
    const revision = manager.getIdentityRevision();
    setMode('reading');
    setError('');
    try {
      const value = await manager.authorized((token) => profileApi.read(token));
      if (!alive.current) return;
      manager.updateProfileIdentity(value, false, revision);
      if (profile) {
        setCurrent(value);
        setMode('review');
      } else {
        setProfile(value);
        setName(value.name);
        setMode('ready');
      }
    } catch (reason: unknown) {
      if (!alive.current) return;
      setMode(profile ? 'review-required' : 'load-error');
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || mode !== 'ready' || !profile) return;
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? t('راجع الاسم.'));
      input.current?.focus();
      return;
    }
    if (parsed.data === profile.name) {
      setName(profile.name);
      return;
    }
    lock.current = true;
    setMode('saving');
    const revision = manager.getIdentityRevision();
    setError('');
    setFieldError('');
    setNotice('');
    try {
      const value = await manager.authorized((token) =>
        profileApi.update(token, parsed.data, profile.version),
      );
      if (!alive.current) return;
      setProfile(value);
      setName(value.name);
      setMode('ready');
      manager.updateProfileIdentity(value, true, revision);
      setNotice(t('اسمك اتحدّث. هتلاقيه في كل مساحاتك.'));
      notifySuccess(t('اسمك اتحدّث.'));
    } catch (reason: unknown) {
      if (!alive.current) return;
      if (reason instanceof ApiError && reason.status === 422) {
        setMode('ready');
        setFieldError(t('الاسم لازم يكون من حرفين إلى ١٠٠ حرف.'));
        input.current?.focus();
      } else {
        setMode('review-required');
        setError(
          reason instanceof ApiError && reason.code === 'PROFILE_CONFLICT'
            ? t('الاسم اتغيّر من مكان تاني. اقرأ النسخة الحالية قبل ما تحفظ.')
            : t(
                'مش قادرين نأكد نتيجة الحفظ. اقرأ الحالة الحالية؛ تعديلاتك المكتوبة لسه هنا.',
              ),
        );
      }
    } finally {
      lock.current = false;
    }
  }

  function resolve(useCurrent: boolean) {
    if (!current || lock.current) return;
    setProfile(current);
    if (useCurrent) setName(current.name);
    setCurrent(null);
    setMode('ready');
    setError('');
    setFieldError('');
    setNotice(
      useCurrent
        ? t('اعتمدنا الاسم الحالي.')
        : t('تعديلك موجود للمراجعة. احفظه لما تكون جاهز.'),
    );
    if (!useCurrent) requestAnimationFrame(() => input.current?.focus());
  }

  const role = {
    owner: t('مالك المساحة'),
    admin: t('مدير المساحة'),
    member: t('عضو المساحة'),
  }[identity.membership.role];
  return (
    <section
      className="profile-settings"
      aria-labelledby="profile-title"
      aria-busy={pending}
    >
      <div className="profile-sheet">
        <header className="profile-sheet-heading">
          <span className="profile-monogram" aria-hidden="true">
            {Array.from(identity.user.name)[0]}
          </span>
          <div>
            <h2 id="profile-title">
              <UserRound size={18} aria-hidden="true" />
              {t('الملف الشخصي')}{' '}
            </h2>
            <p>{t('اسمك وبيانات حسابك في كل مساحاتك.')}</p>
          </div>
        </header>
        {mode === 'loading' && (
          <LoadingPlaceholder
            label={t('بنحمّل بياناتك…')}
            kind="form"
            count={1}
          />
        )}
        {mode === 'load-error' && (
          <div className="profile-recovery">
            <p role="alert">{t(error)}</p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void readCurrent()}
            >
              {t('حاول تحميل البروفايل تاني')}{' '}
            </button>
          </div>
        )}
        {profile && (
          <>
            <form
              onSubmit={(event) => void save(event)}
              noValidate
              aria-label={t('تعديل الملف الشخصي')}
            >
              <div className="field">
                <label htmlFor="profile-name">{t('الاسم الشخصي')}</label>
                <input
                  id="profile-name"
                  ref={input}
                  autoComplete="name"
                  maxLength={200}
                  value={name}
                  disabled={pending}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={
                    'profile-name-hint' +
                    (fieldError ? ' profile-name-error' : '')
                  }
                  onChange={(event) => {
                    setName(event.target.value);
                    setFieldError('');
                    setNotice('');
                  }}
                />
                <p id="profile-name-hint" className="profile-hint">
                  {t(
                    'من حرفين إلى ١٠٠ حرف. الاسم ده يخص حسابك، واسم مساحة العمل مستقل.',
                  )}{' '}
                </p>
                {fieldError && (
                  <p
                    id="profile-name-error"
                    className="field-error"
                    role="alert"
                  >
                    {t(fieldError)}
                  </p>
                )}
              </div>
              <div className="profile-readonly">
                <div>
                  <span>{t('البريد الإلكتروني')}</span>
                  <p dir="ltr">{profile.email}</p>
                  <small>{t('تغيير البريد يحتاج خطوة تحقق منفصلة.')}</small>
                </div>
                <div>
                  <span>{t('دورك في المساحة الحالية')}</span>
                  <p>{role}</p>
                  <small>{identity.workspace.name}</small>
                </div>
              </div>
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
                        : t('اقرأ الحالة الحالية')}
                    </button>
                  )}
                  {current && mode === 'review' && (
                    <>
                      <h3>{t('راجع الاسم الحالي')}</h3>
                      <p>
                        {t('الاسم المحفوظ الآن:')}{' '}
                        <strong>{current.name}</strong>
                      </p>
                      <p>
                        {t(
                          'الاسم اللي كتبته لسه موجود فوق. اختار النسخة اللي تكمل بيها.',
                        )}{' '}
                      </p>
                      <div className="profile-actions">
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => resolve(true)}
                        >
                          {t('اعتمد الاسم الحالي')}{' '}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => resolve(false)}
                        >
                          {t('احتفظ بتعديلي للمراجعة')}{' '}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="profile-actions">
                <button
                  className="button button-primary"
                  type="submit"
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
                  {mode === 'saving' ? t('بنحفظ اسمك…') : t('حفظ الاسم')}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={mode !== 'ready' || !dirty}
                  onClick={() => {
                    setName(profile.name);
                    setFieldError('');
                    setNotice('');
                    input.current?.focus();
                  }}
                >
                  {t('تراجع عن التعديل')}{' '}
                </button>
              </div>
              {notice && (
                <p
                  className="profile-success"
                  role="status"
                  tabIndex={-1}
                  ref={status}
                >
                  {t(notice)}
                </p>
              )}
            </form>
            <p className="profile-footnote">
              {t(
                'المستندات الصادرة تحتفظ بالبيانات المحفوظة وقت إصدارها.',
              )}{' '}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
