'use client';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '../../../i18n/language-provider';
import { authApi, errorMessage } from '../services/auth-api';
import type { GoogleSignInData } from '../services/auth-api';
import { displayNameSchema } from '../schemas/forms';
import { useSession } from './session-provider';

interface GoogleIdentityApi {
  initialize(options: {
    client_id: string;
    nonce: string;
    callback(response: { credential: string }): void;
    auto_select: boolean;
    ux_mode: 'popup';
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline';
      size: 'large';
      text: 'continue_with';
      shape: 'pill';
      width: number;
      locale: string;
    },
  ): void;
}
type Step = { kind: 'onboarding-required'; email: string; name: string };

export function GoogleSignIn({
  disabled,
  onBusyChange,
  onFlowChange,
}: {
  disabled: boolean;
  onBusyChange(busy: boolean): void;
  onFlowChange(active: boolean): void;
}) {
  const { t, locale } = useI18n();
  const { manager } = useSession();
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<Step | null>(null);
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const button = useRef<HTMLDivElement>(null);
  const credential = useRef('');
  const pending = useRef(false);
  const alive = useRef(true);
  const blocked = useRef(disabled);
  const focusTarget = useRef<HTMLInputElement>(null);
  useEffect(() => {
    blocked.current = disabled;
  }, [disabled]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      credential.current = '';
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void authApi
      .googleConfig(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted && value.enabled) setClientId(value.clientId);
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, []);

  const exchange = useCallback(
    async (data: GoogleSignInData) => {
      if (pending.current || blocked.current) return;
      pending.current = true;
      setBusy(true);
      onBusyChange(true);
      setMessage('');
      try {
        const result = await manager.googleSignIn({ ...data, locale });
        if (!alive.current) return;
        if (result.kind === 'authenticated') {
          credential.current = '';
          router.replace('/dashboard');
        } else {
          setStep(result);
          onFlowChange(true);
          if (result.kind === 'onboarding-required') setName(result.name);
        }
      } catch (error: unknown) {
        if (alive.current) setMessage(errorMessage(error));
      } finally {
        pending.current = false;
        if (alive.current) {
          setBusy(false);
          onBusyChange(false);
        }
      }
    },
    [manager, onBusyChange, onFlowChange, router, locale],
  );
  const exchangeRef = useRef(exchange);
  useEffect(() => {
    exchangeRef.current = exchange;
  }, [exchange]);
  useEffect(() => {
    if (step) focusTarget.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!clientId || !scriptReady || !button.current || step) return;
    let active = true;
    const element = button.current;
    void authApi
      .googleChallenge()
      .then(({ nonce }) => {
        if (!active) return;
        const api = (
          window as Window & {
            google?: { accounts: { id: GoogleIdentityApi } };
          }
        ).google?.accounts.id;
        if (!api) throw new Error('Google library unavailable');
        element.replaceChildren();
        api.initialize({
          client_id: clientId,
          nonce,
          auto_select: false,
          ux_mode: 'popup',
          callback: (response) => {
            if (
              !active ||
              pending.current ||
              blocked.current ||
              !response.credential
            )
              return;
            credential.current = response.credential;
            void exchangeRef.current({ credential: response.credential });
          },
        });
        api.renderButton(element, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: Math.min(360, element.clientWidth || 280),
          locale,
        });
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setReady(false);
          setMessage(
            'تعذّر تجهيز زر Google. حاول مرة تانية أو استخدم البريد وكلمة المرور.',
          );
        }
      });
    return () => {
      active = false;
      element.replaceChildren();
    };
  }, [clientId, scriptReady, locale, attempt, step]);
  function reset() {
    credential.current = '';
    setStep(null);
    onFlowChange(false);
    setMessage('');
    setReady(false);
    setAttempt((value) => value + 1);
  }
  if (!clientId) return null;
  return (
    <section className="google-auth" aria-label={t('المتابعة باستخدام Google')}>
      <Script
        id="google-identity"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => {
          setScriptFailed(true);
          setMessage('تعذّر تحميل Google. تقدر تكمل بالبريد وكلمة المرور.');
        }}
      />
      {!step ? (
        <>
          <div
            className="google-button-slot"
            inert={disabled || busy}
            aria-busy={!ready && !message}
            ref={button}
          />
          {(!ready || busy) && !message && (
            <p className="google-auth-status" role="status">
              {busy ? t('جاري تسجيل الدخول…') : t('جاري تجهيز Google…')}
            </p>
          )}
        </>
      ) : (
        <form
          className="google-complete"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !displayNameSchema.safeParse(name).success ||
              !displayNameSchema.safeParse(workspaceName).success
            ) {
              setMessage('اكتب اسمك واسم مساحة العمل، من حرفين إلى ١٠٠ حرف.');
              focusTarget.current?.focus();
              return;
            }
            void exchange({
              credential: credential.current,
              name,
              workspaceName,
            });
          }}
        >
          <h2>{t('خطوة أخيرة لمساحتك')}</h2>
          <p className="google-auth-email" dir="ltr">
            {step.email}
          </p>
          <fieldset disabled={busy || disabled}>
            <div className="field">
              <label htmlFor="google-name">{t('اسمك')}</label>
              <input
                ref={focusTarget}
                id="google-name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="field">
              <label htmlFor="google-workspace">{t('اسم مساحة العمل')}</label>
              <input
                id="google-workspace"
                autoComplete="organization"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                required
                maxLength={200}
              />
            </div>
            <button
              className="button button-primary submit-button"
              type="submit"
            >
              {busy ? t('جاري تسجيل الدخول…') : t('إنشاء مساحتي والمتابعة')}
            </button>
          </fieldset>
          <button
            className="google-auth-reset"
            type="button"
            disabled={busy}
            onClick={reset}
          >
            {t('اختيار حساب Google آخر')}
          </button>
        </form>
      )}
      {message && (
        <div className="form-notice" role="alert">
          {t(message)}
        </div>
      )}
      {!step && message && !scriptFailed && (
        <button
          className="google-auth-reset"
          type="button"
          disabled={busy || disabled}
          onClick={reset}
        >
          {t('حاول مرة تانية')}
        </button>
      )}
      {!step && (
        <div className="google-auth-divider">
          <span>{t('أو باستخدام البريد الإلكتروني')}</span>
        </div>
      )}
    </section>
  );
}
