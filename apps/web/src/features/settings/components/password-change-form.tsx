'use client';
import { useI18n } from '../../../i18n/language-provider';
import Link from 'next/link';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react';
import { z } from 'zod';
import { loginSchema, registerSchema } from '../../auth/schemas/forms';
import { ApiError, errorMessage } from '../../auth/services/auth-api';
import { useSession } from '../../auth/components/session-provider';
import { useUnsavedProfile } from '../hooks/use-unsaved-profile';

const schema = z
  .object({
    currentPassword: loginSchema.shape.password,
    newPassword: registerSchema.shape.password,
    confirmation: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmation, {
    path: ['confirmation'],
    message: 'كلمتا المرور لازم يكونوا متطابقين.',
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: 'اختار كلمة مرور مختلفة عن الحالية.',
  });
const empty = { currentPassword: '', newPassword: '', confirmation: '' };
const fields = [
  {
    key: 'currentPassword',
    label: 'كلمة المرور الحالية',
    autocomplete: 'current-password',
  },
  {
    key: 'newPassword',
    label: 'كلمة المرور الجديدة',
    autocomplete: 'new-password',
  },
  {
    key: 'confirmation',
    label: 'تأكيد كلمة المرور الجديدة',
    autocomplete: 'new-password',
  },
] as const;

export function PasswordChangeForm() {
  const { t } = useI18n();
  const { manager } = useSession();
  const [values, setValues] = useState(empty);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'editing' | 'confirming' | 'saving'>(
    'editing',
  );
  const form = useRef<HTMLFormElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const nextFocus = useRef<string | null>(null);
  const alive = useRef(false);
  useUnsavedProfile(Object.values(values).some(Boolean) || mode !== 'editing');
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (mode === 'confirming') cancel.current?.focus();
    else if (mode === 'editing' && nextFocus.current) {
      form.current?.querySelector<HTMLElement>(nextFocus.current)?.focus();
      nextFocus.current = null;
    }
  }, [mode]);

  function review(event: FormEvent) {
    event.preventDefault();
    if (mode !== 'editing' || lock.current) return;
    setMessage('');
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)
        ?.focus();
      return;
    }
    setErrors({});
    setMode('confirming');
  }
  async function confirm() {
    if (lock.current || mode !== 'confirming') return;
    lock.current = true;
    setMode('saving');
    setVisible({});
    try {
      await manager.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (alive.current) setValues(empty);
    } catch (reason: unknown) {
      if (!alive.current) return;
      if (manager.getSnapshot().status !== 'authenticated') {
        setValues(empty);
        return;
      }
      setMode('editing');
      if (
        reason instanceof ApiError &&
        reason.code === 'CURRENT_PASSWORD_INCORRECT'
      ) {
        setValues((current) => ({ ...current, currentPassword: '' }));
        setErrors({ currentPassword: t('كلمة المرور الحالية غير صحيحة.') });
        nextFocus.current = '[name="currentPassword"]';
      } else {
        setMessage(errorMessage(reason));
        nextFocus.current = 'button[type="submit"]';
      }
    } finally {
      lock.current = false;
    }
  }
  return (
    <section className="security-settings" aria-labelledby="security-title">
      <div className="profile-sheet">
        <div className="profile-sheet-heading">
          <span className="profile-monogram">
            <LockKeyhole aria-hidden="true" size={26} />
          </span>
          <div>
            <h2 id="security-title">{t('أمان الحساب')}</h2>
            <p>{t('غيّر كلمة مرورك بخطوتين واضحتين.')}</p>
          </div>
        </div>
        <p className="security-intro">
          {t(
            'لو بتدخل بحساب Google ولسه معندكش كلمة مرور، تقدر تنشئها بعد تأكيد بريدك من صفحة استرجاع كلمة المرور، لما خدمة البريد تكون متاحة.',
          )}{' '}
          <Link href="/forgot-password">{t('استرجاع كلمة المرور')}</Link>
        </p>
        <form ref={form} noValidate onSubmit={review}>
          <p className="security-intro" id="password-policy">
            {t(
              'استخدم من ١٥ إلى ١٢٨ حرفًا. جملة طويلة يسهل تذكّرها مناسبة، والمسافات مسموحة.',
            )}{' '}
          </p>
          {fields.map(({ key, label, autocomplete }) => (
            <div className="field" key={key}>
              <label htmlFor={`security-${key}`}>{t(label)}</label>
              <div className="password-field">
                <input
                  id={`security-${key}`}
                  name={key}
                  type={visible[key] ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete={autocomplete}
                  maxLength={256}
                  value={values[key]}
                  disabled={mode !== 'editing'}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={
                    `${key === 'newPassword' ? 'password-policy ' : ''}${errors[key] ? `security-${key}-error` : ''}`.trim() ||
                    undefined
                  }
                  onChange={(event) => {
                    setValues({ ...values, [key]: event.target.value });
                    setErrors({ ...errors, [key]: '' });
                    setMessage('');
                  }}
                />
                <button
                  className="password-toggle"
                  type="button"
                  disabled={mode !== 'editing'}
                  aria-label={t('{0} {1}', [
                    visible[key] ? 'إخفاء' : 'إظهار',
                    label,
                  ])}
                  aria-pressed={Boolean(visible[key])}
                  onClick={() =>
                    setVisible({ ...visible, [key]: !visible[key] })
                  }
                >
                  {visible[key] ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors[key] && (
                <span
                  className="field-error"
                  id={`security-${key}-error`}
                  role="alert"
                >
                  {t(errors[key])}
                </span>
              )}
            </div>
          ))}
          <p className="profile-hint">
            {t(
              'التغيير ينهي جلسات حسابك على كل الأجهزة، بما فيها الجلسة الحالية. هتحتاج تسجّل دخولك بالجديدة.',
            )}{' '}
          </p>
          {message && (
            <p role="alert" className="form-notice">
              {t(message)}
            </p>
          )}
          {mode === 'editing' ? (
            <div className="profile-actions">
              <button
                type="submit"
                ref={trigger}
                className="button button-primary"
              >
                {t('مراجعة تغيير كلمة المرور')}{' '}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setValues(empty);
                  setErrors({});
                  setVisible({});
                  setMessage('');
                }}
                disabled={!Object.values(values).some(Boolean)}
              >
                {t('مسح الحقول')}{' '}
              </button>
            </div>
          ) : (
            <div
              className="profile-recovery security-confirmation"
              role="region"
              aria-labelledby="password-confirmation-title"
            >
              <h3 id="password-confirmation-title">
                {t('تأكيد التغيير وإنهاء كل الجلسات')}{' '}
              </h3>
              <p>
                {t(
                  'بالتأكيد، كلمة المرور الجديدة هتتحفظ وكل الأجهزة هتخرج من حسابك. سجّل دخولك بالجديدة بعدها.',
                )}{' '}
              </p>
              <div className="profile-actions">
                <button
                  type="button"
                  ref={cancel}
                  className="button button-secondary"
                  disabled={mode === 'saving'}
                  onClick={() => {
                    setMode('editing');
                    requestAnimationFrame(() => trigger.current?.focus());
                  }}
                >
                  {t('رجوع للمراجعة')}{' '}
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    void confirm();
                  }}
                  disabled={mode === 'saving'}
                >
                  {mode === 'saving' && (
                    <LoaderCircle
                      className="spin"
                      size={18}
                      aria-hidden="true"
                    />
                  )}
                  {mode === 'saving'
                    ? t('بنغيّر كلمة المرور…')
                    : t('تأكيد التغيير والخروج')}
                </button>
              </div>
              {mode === 'saving' && (
                <p role="status">
                  {t('جاري الحفظ. استنى النتيجة قبل مغادرة الصفحة.')}{' '}
                </p>
              )}
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
