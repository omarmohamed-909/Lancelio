'use client';
import { useI18n } from '../../../i18n/language-provider';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { forgotPasswordSchema, resetPasswordSchema } from '../schemas/forms';
import type {
  ForgotPasswordValues,
  ResetPasswordValues,
} from '../schemas/forms';
import { authApi, ApiError, errorMessage } from '../services/auth-api';
import { PasswordToggle } from './auth-forms';
import { useHydrated } from '../../../shared/hooks/use-hydrated';
function LoginLink() {
  const { t } = useI18n();
  return (
    <p className="form-switch">
      <Link href="/login">{t('العودة لتسجيل الدخول')}</Link>
    </p>
  );
}
function Progress({ step }: { step: 1 | 2 }) {
  const { t } = useI18n();
  return (
    <ol className="recovery-progress" aria-label={t('خطوات الاسترجاع')}>
      <li aria-current={step === 1 ? 'step' : undefined}>
        <span aria-hidden="true">{step === 2 ? <Check size={14} /> : 1}</span>
        {t('اطلب الرابط')}{' '}
      </li>
      <li aria-current={step === 2 ? 'step' : undefined}>
        <span aria-hidden="true">2</span>
        {t('كلمة مرور جديدة')}{' '}
      </li>
    </ol>
  );
}
export function ForgotPasswordForm() {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const busy = useRef(false);
  const [accepted, setAccepted] = useState(false),
    [message, setMessage] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });
  async function submit(values: ForgotPasswordValues) {
    setMessage('');
    try {
      await authApi.forgotPassword(values.email);
      setAccepted(true);
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    }
  }
  return (
    <>
      <Progress step={1} />
      <span className="form-eyebrow">{t('نرجّعك لمساحتك')}</span>
      <h1>{t('نسيت كلمة المرور؟')}</h1>
      <p className="form-subtitle">
        {t(
          'اكتب البريد اللي سجلت بيه. هنرسل لك رابط لتعيين كلمة مرور جديدة.',
        )}{' '}
      </p>
      {accepted ? (
        <div className="recovery-result" role="status">
          <Mail size={25} aria-hidden="true" />
          <h2>{t('راجع بريدك')}</h2>
          <p>
            {t(
              'لو البريد مرتبط بحساب متاح، هيوصلك رابط خلال دقائق. راجع الرسائل غير المرغوب فيها كمان.',
            )}{' '}
          </p>
          <p>{t('الرابط صالح لمدة ٣٠ دقيقة ويُستخدم مرة واحدة.')}</p>
          <button
            type="button"
            className="button"
            onClick={() => setAccepted(false)}
          >
            {t('طلب رابط مرة أخرى')}{' '}
          </button>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            if (busy.current) {
              event.preventDefault();
              return;
            }
            busy.current = true;
            void handleSubmit(submit)(event).finally(() => {
              busy.current = false;
            });
          }}
        >
          <fieldset disabled={!hydrated || isSubmitting}>
            <div className="field">
              <label htmlFor="recovery-email">{t('البريد الإلكتروني')}</label>
              <input
                id="recovery-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? 'recovery-email-error' : undefined
                }
              />
              {errors.email && (
                <span className="field-error" id="recovery-email-error">
                  {t(errors.email.message)}
                </span>
              )}
            </div>
            {message && (
              <div className="form-notice" role="alert">
                {t(message)}
              </div>
            )}
            <button
              type="submit"
              className="button button-primary submit-button"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle size={18} className="spin" />
                  {t('جاري الطلب…')}{' '}
                </>
              ) : (
                <>
                  {t('إرسال رابط الاسترجاع')} <ArrowLeft size={18} />
                </>
              )}
            </button>
          </fieldset>
        </form>
      )}
      <LoginLink />
    </>
  );
}
export function ResetPasswordForm() {
  const { t } = useI18n();
  const captured = useRef<string | null>(null),
    busy = useRef(false);
  const [token, setToken] = useState<string | null>(null),
    [visible, setVisible] = useState(false);
  const [result, setResult] = useState<
      'editing' | 'saved' | 'invalid' | 'uncertain'
    >('editing'),
    [message, setMessage] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });
  useEffect(() => {
    if (captured.current === null) {
      const value =
        new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
      captured.current = /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : '';
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname,
      );
    }
    const value = captured.current;
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) setToken(value);
    });
    function openNewLink() {
      // Native navigation to another fragment can reuse this document; load a fresh form.
      if (window.location.hash) window.location.reload();
    }
    window.addEventListener('hashchange', openNewLink);
    return () => {
      alive = false;
      window.removeEventListener('hashchange', openNewLink);
    };
  }, []);
  async function submit(values: ResetPasswordValues) {
    if (!token) return;
    setMessage('');
    try {
      await authApi.resetPassword(token, values.password);
      setResult('saved');
      setToken('');
      captured.current = '';
      reset();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === 'RECOVERY_INVALID') {
        setResult('invalid');
        setToken('');
        captured.current = '';
        reset();
      } else if (
        !(error instanceof ApiError) ||
        error.status === 0 ||
        error.status >= 500
      ) {
        setResult('uncertain');
        setToken('');
        captured.current = '';
        reset();
      } else setMessage(errorMessage(error));
    }
  }
  if (token === null) return <p role="status">{t('بنفتح رابط الاسترجاع…')}</p>;
  if (result === 'saved')
    return (
      <>
        <div className="recovery-result" role="status">
          <ShieldCheck size={28} aria-hidden="true" />
          <h1>{t('كلمة المرور اتغيّرت')}</h1>
          <p>
            {t(
              'أنهينا كل جلسات الدخول القديمة. سجّل دخولك بكلمة المرور الجديدة.',
            )}{' '}
          </p>
        </div>
        <LoginLink />
      </>
    );
  if (result === 'uncertain')
    return (
      <>
        <h1>{t('نتيجة الحفظ غير مؤكدة')}</h1>
        <p className="form-subtitle" role="alert">
          {t(
            'الاتصال انقطع قبل ما نتأكد من النتيجة. جرّب تسجيل الدخول بكلمة المرور الجديدة. لو ما اشتغلتش، اطلب رابط استرجاع جديد.',
          )}{' '}
        </p>
        <LoginLink />
        <p className="form-switch">
          <Link href="/forgot-password">{t('طلب رابط جديد')}</Link>
        </p>
      </>
    );
  if (!token || result === 'invalid')
    return (
      <>
        <h1>{t('الرابط غير متاح')}</h1>
        <p className="form-subtitle" role="alert">
          {t(
            'الرابط غير صحيح، انتهت صلاحيته، أو اتستخدم بالفعل. اطلب رابط جديد من بريدك.',
          )}{' '}
        </p>
        <Link
          className="button button-primary submit-button"
          href="/forgot-password"
        >
          {t('طلب رابط جديد')}{' '}
        </Link>
        <LoginLink />
      </>
    );
  return (
    <>
      <Progress step={2} />
      <span className="form-eyebrow">{t('آخر خطوة')}</span>
      <h1>{t('كلمة مرور جديدة')}</h1>
      <p className="form-subtitle">
        {t(
          'اختار عبارة طويلة تفتكرها. بعد الحفظ، هننهي كل جلسات الدخول القديمة.',
        )}{' '}
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          if (busy.current) {
            event.preventDefault();
            return;
          }
          busy.current = true;
          void handleSubmit(submit)(event).finally(() => {
            busy.current = false;
          });
        }}
      >
        <fieldset disabled={isSubmitting}>
          <div className="field">
            <label htmlFor="new-password">{t('كلمة المرور الجديدة')}</label>
            <div className="password-field">
              <input
                id="new-password"
                type={visible ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                {...register('password')}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'new-password-error' : 'new-password-help'
                }
              />
              <PasswordToggle
                visible={visible}
                onClick={() => setVisible(!visible)}
              />
            </div>
            {errors.password ? (
              <span className="field-error" id="new-password-error">
                {t(errors.password.message)}
              </span>
            ) : (
              <span className="field-help" id="new-password-help">
                {t('من ١٥ إلى ١٢٨ حرفًا؛ عبارة طويلة اختيار أفضل.')}{' '}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="confirm-password">{t('تأكيد كلمة المرور')}</label>
            <input
              id="confirm-password"
              type={visible ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              {...register('confirmation')}
              aria-invalid={Boolean(errors.confirmation)}
              aria-describedby={
                errors.confirmation ? 'confirmation-error' : undefined
              }
            />
            {errors.confirmation && (
              <span className="field-error" id="confirmation-error">
                {t(errors.confirmation.message)}
              </span>
            )}
          </div>
          {message && (
            <div className="form-notice" role="alert">
              {t(message)}
            </div>
          )}
          <button type="submit" className="button button-primary submit-button">
            {isSubmitting ? (
              <>
                <LoaderCircle size={18} className="spin" />
                {t('جاري الحفظ…')}{' '}
              </>
            ) : (
              <>
                {t('حفظ كلمة المرور')} <ArrowLeft size={18} />
              </>
            )}
          </button>
        </fieldset>
      </form>
      <LoginLink />
    </>
  );
}
