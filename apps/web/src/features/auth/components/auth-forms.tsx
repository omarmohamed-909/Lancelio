'use client';
import { useI18n } from '../../../i18n/language-provider';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import { loginSchema, registerSchema } from '../schemas/forms';
import type { LoginValues, RegisterValues } from '../schemas/forms';
import { errorMessage } from '../services/auth-api';
import { useSession } from './session-provider';
import { useHydrated } from '../../../shared/hooks/use-hydrated';
import { GoogleSignIn } from './google-sign-in';

export function PasswordToggle({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      className="password-toggle"
      type="button"
      onClick={onClick}
      aria-label={visible ? t('إخفاء كلمة المرور') : t('إظهار كلمة المرور')}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
function ErrorNotice({ message }: { message: string }) {
  const { t } = useI18n();
  return message ? (
    <div className="form-notice" role="alert">
      {t(message)}
    </div>
  ) : null;
}

export function LoginForm() {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const { manager, snapshot } = useSession();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleFlow, setGoogleFlow] = useState(false);
  const submitting = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  useEffect(() => {
    if (snapshot.status === 'authenticated') router.replace('/dashboard');
  }, [snapshot.status, router]);

  const submit = async (values: LoginValues) => {
    setMessage('');
    try {
      await manager.login(values);
      router.replace('/dashboard');
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <>
      <span className="form-eyebrow">{t('مرحبًا بيك من جديد')}</span>
      <h1>
        {t('أهلًا بعودتك')}
        <span>.</span>
      </h1>
      <p className="form-subtitle">{t('سجّل دخولك وكمّل من آخر خطوة.')}</p>
      <GoogleSignIn
        disabled={!hydrated || isSubmitting}
        onBusyChange={setGoogleBusy}
        onFlowChange={setGoogleFlow}
      />
      {snapshot.status === 'anonymous' && snapshot.notice && (
        <p className="form-notice" role="status">
          {snapshot.notice === 'password-changed'
            ? t(
                'كلمة المرور اتغيّرت وانتهت جلسات حسابك على كل الأجهزة. سجّل دخولك بالكلمة الجديدة.',
              )
            : t(
                'نتيجة تغيير كلمة المرور غير مؤكدة. جرّب الدخول بالكلمة الجديدة؛ لو ما اشتغلتش استخدم الحالية أو استرجع كلمة المرور. الطلب مش هيتكرر تلقائيًا.',
              )}
        </p>
      )}
      <form
        hidden={googleFlow}
        onSubmit={(event) => {
          if (submitting.current) {
            event.preventDefault();
            return;
          }
          submitting.current = true;
          void handleSubmit(submit)(event).finally(() => {
            submitting.current = false;
          });
        }}
        noValidate
      >
        <fieldset disabled={!hydrated || isSubmitting || googleBusy}>
          <div className="field">
            <label htmlFor="email">{t('البريد الإلكتروني')}</label>
            <input
              id="email"
              type="email"
              dir="ltr"
              placeholder="you@example.com"
              autoComplete="email"
              {...register('email')}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <span id="email-error" className="field-error">
                {t(errors.email.message)}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="password">{t('كلمة المرور')}</label>
            <div className="password-field">
              <input
                id="password"
                type={visible ? 'text' : 'password'}
                dir="ltr"
                autoComplete="current-password"
                {...register('password')}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'password-error' : undefined
                }
              />
              <PasswordToggle
                visible={visible}
                onClick={() => setVisible(!visible)}
              />
            </div>
            {errors.password && (
              <span id="password-error" className="field-error">
                {t(errors.password.message)}
              </span>
            )}
          </div>
          <ErrorNotice message={message} />
          <button className="button button-primary submit-button" type="submit">
            {isSubmitting ? (
              <>
                <LoaderCircle className="spin" size={18} />{' '}
                {t('جاري تسجيل الدخول…')}{' '}
              </>
            ) : (
              <>
                {t('دخول لمساحتك')} <ArrowLeft size={18} />
              </>
            )}
          </button>
        </fieldset>
      </form>
      <p className="recovery-link" hidden={googleFlow}>
        <Link href="/forgot-password">{t('نسيت كلمة المرور؟')}</Link>
      </p>
      <p className="form-switch">
        {t('لسه معندكش حساب؟')}{' '}
        <Link href="/register">{t('ابدأ مساحة جديدة')}</Link>
      </p>
      <div className="security-note">
        <ShieldCheck size={16} /> {t('مساحتك خاصة، وبياناتك ليك.')}{' '}
      </div>
    </>
  );
}

export function RegisterForm() {
  const { t, locale } = useI18n();
  const hydrated = useHydrated();
  const { manager, snapshot } = useSession();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleFlow, setGoogleFlow] = useState(false);
  const submitting = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { workspaceName: '' },
  });
  useEffect(() => {
    if (snapshot.status === 'authenticated') router.replace('/dashboard');
  }, [snapshot.status, router]);
  const submit = async (values: RegisterValues) => {
    setMessage('');
    try {
      await manager.register({
        name: values.name,
        email: values.email,
        password: values.password,
        locale,
        ...(values.workspaceName
          ? { workspaceName: values.workspaceName }
          : {}),
      });
      router.replace('/dashboard');
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <>
      <span className="form-eyebrow">{t('أول خطوة لشغل أكثر ترتيبًا')}</span>
      <h1>
        {t('ابدأ مساحتك')}
        <span>.</span>
      </h1>
      <p className="form-subtitle">
        {t('حساب واحد، وبداية جديدة لشغلك الحر.')}
      </p>
      <GoogleSignIn
        disabled={!hydrated || isSubmitting}
        onBusyChange={setGoogleBusy}
        onFlowChange={setGoogleFlow}
      />
      <form
        hidden={googleFlow}
        onSubmit={(event) => {
          if (submitting.current) {
            event.preventDefault();
            return;
          }
          submitting.current = true;
          void handleSubmit(submit)(event).finally(() => {
            submitting.current = false;
          });
        }}
        noValidate
      >
        <fieldset disabled={!hydrated || isSubmitting || googleBusy}>
          <div className="registration-details">
            <div className="field">
              <label htmlFor="name">{t('اسمك')}</label>
              <input
                id="name"
                autoComplete="name"
                placeholder={t('الاسم اللي تحب نناديك بيه')}
                {...register('name')}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && (
                <span id="name-error" className="field-error">
                  {t(errors.name.message)}
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="workspaceName">
                {t('اسم مساحة العمل')}{' '}
                <span className="optional">{t('اختياري')}</span>
              </label>
              <input
                id="workspaceName"
                placeholder={t('مثلًا: استوديو أحمد')}
                {...register('workspaceName')}
                aria-invalid={Boolean(errors.workspaceName)}
                aria-describedby={
                  errors.workspaceName ? 'workspace-error' : undefined
                }
              />
              {errors.workspaceName && (
                <span id="workspace-error" className="field-error">
                  {t(errors.workspaceName.message)}
                </span>
              )}
            </div>
          </div>
          <div className="field">
            <label htmlFor="email">{t('البريد الإلكتروني')}</label>
            <input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <span id="email-error" className="field-error">
                {t(errors.email.message)}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="password">{t('كلمة المرور')}</label>
            <div className="password-field">
              <input
                id="password"
                type={visible ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                {...register('password')}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'password-error' : 'password-help'
                }
              />
              <PasswordToggle
                visible={visible}
                onClick={() => setVisible(!visible)}
              />
            </div>
            {errors.password ? (
              <span id="password-error" className="field-error">
                {t(errors.password.message)}
              </span>
            ) : (
              <span id="password-help" className="field-help">
                {t('١٥ حرفًا على الأقل. عبارة طويلة اختيار أفضل.')}{' '}
              </span>
            )}
          </div>
          <ErrorNotice message={message} />
          <button className="button button-primary submit-button" type="submit">
            {isSubmitting ? (
              <>
                <LoaderCircle className="spin" size={18} />{' '}
                {t('جاري إنشاء المساحة…')}{' '}
              </>
            ) : (
              <>
                {t('إنشاء حسابي')} <ArrowLeft size={18} />
              </>
            )}
          </button>
        </fieldset>
      </form>
      <p className="form-switch">
        {t('عندك حساب بالفعل؟')} <Link href="/login">{t('تسجيل الدخول')}</Link>
      </p>
    </>
  );
}
