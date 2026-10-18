'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import {
  ChartNoAxesCombined,
  CircleHelp,
  FolderKanban,
  LoaderCircle,
  MessageCircleMore,
  Plus,
  Send,
  Square,
  Wallet,
  X,
} from 'lucide-react';
import { useI18n } from '../../../i18n/language-provider';
import type { Locale } from '../../../i18n/locale';
import { translate } from '../../../i18n/translate';
import { BrandMark } from '../../../components/ui/brand';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import { assistantApi } from '../services/assistant-api';
import type { AssistantReply } from '../services/assistant-api';
import { assistantSuggestions } from '../help';
import { AssistantAnswer } from './assistant-reply';
import { answerLanguage } from '../answer-language';

interface Turn {
  id: string;
  question: string;
  locale: Locale;
  reply: AssistantReply | null;
  error: 'failed' | 'limited' | 'cancelled' | null;
  pending: boolean;
}
const icons = {
  product: MessageCircleMore,
  overview: ChartNoAxesCombined,
  projects: FolderKanban,
  money: Wallet,
  help: CircleHelp,
};

export function WorkspaceAssistant() {
  const { snapshot } = useSession();
  const pathname = usePathname();
  const workspace =
    /^\/(dashboard|clients|projects|proposals|invoices|notifications|settings)(?:\/|$)/u.test(
      pathname,
    );
  if (snapshot.status !== 'authenticated' || !workspace) return null;
  return (
    <Assistant
      key={snapshot.identity.workspace.id + ':' + snapshot.identity.user.id}
    />
  );
}

function Assistant() {
  const { t, intlLocale, locale } = useI18n();
  const { manager } = useSession();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<
    'guided' | 'openai' | 'gemini' | 'unavailable' | null
  >(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const active = useRef<AbortController | null>(null);
  const pending = turns.some((turn) => turn.pending);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const trigger = launcher.current;
    element?.showModal();
    input.current?.focus();
    return () => {
      element?.close();
      trigger?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open || mode !== null) return;
    const controller = new AbortController();
    void manager
      .authorized((token) => assistantApi.mode(token, controller.signal))
      .then((data) => {
        if (!controller.signal.aborted) setMode(data.mode);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMode('unavailable');
      });
    return () => controller.abort();
  }, [open, mode, manager, attempt]);
  useEffect(() => {
    if (open && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [turns, open]);

  async function send(question: string, retryId?: string) {
    const text = question.trim();
    if (
      active.current ||
      !text ||
      text.length > 1000 ||
      mode === null ||
      mode === 'unavailable' ||
      (!retryId && turns.length >= 20)
    )
      return;
    const id = retryId ?? crypto.randomUUID();
    const history = (
      retryId
        ? turns.slice(
            0,
            turns.findIndex((turn) => turn.id === retryId),
          )
        : turns
    )
      .filter((turn) => turn.reply !== null)
      .slice(-6)
      .map((turn) => turn.question);
    const controller = new AbortController();
    active.current = controller;
    setTurns((current) =>
      retryId
        ? current.map((turn) =>
            turn.id === id ? { ...turn, error: null, pending: true } : turn,
          )
        : [
            ...current,
            {
              id,
              question: text,
              locale: answerLanguage(
                text,
                turns.filter((turn) => turn.reply !== null).at(-1)?.locale ??
                  locale,
              ),
              reply: null,
              error: null,
              pending: true,
            },
          ],
    );
    if (!retryId) setDraft('');
    try {
      const reply = await manager.authorized((token) =>
        assistantApi.ask(token, text, history, controller.signal),
      );
      if (!controller.signal.aborted) {
        if (!reply.degraded) setMode(reply.engine);
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id ? { ...turn, reply, pending: false } : turn,
          ),
        );
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  pending: false,
                  error:
                    cause instanceof ApiError && cause.status === 429
                      ? 'limited'
                      : 'failed',
                }
              : turn,
          ),
        );
    } finally {
      if (active.current === controller) active.current = null;
    }
  }
  function stop() {
    active.current?.abort();
    active.current = null;
    setTurns((current) =>
      current.map((turn) =>
        turn.pending ? { ...turn, pending: false, error: 'cancelled' } : turn,
      ),
    );
  }
  function newConversation() {
    stop();
    setTurns([]);
    setDraft('');
    setMode(null);
    setAttempt((value) => value + 1);
    requestAnimationFrame(() => input.current?.focus());
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }
  return (
    <>
      <button
        className="assistant-launcher"
        ref={launcher}
        type="button"
        aria-label={t('افتح مساعد Lancelio')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'workspace-assistant' : undefined}
        onClick={() => {
          if (!document.querySelector('dialog[open], [aria-modal="true"]'))
            setOpen(true);
        }}
      >
        <MessageCircleMore size={23} aria-hidden="true" />
        <span>{t('المساعد')}</span>
      </button>
      {open && (
        <dialog
          ref={dialog}
          id="workspace-assistant"
          className="assistant-dialog"
          aria-labelledby="assistant-title"
          aria-describedby="assistant-description"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const b = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < b.left ||
                event.clientX > b.right ||
                event.clientY < b.top ||
                event.clientY > b.bottom
              )
                close();
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
              ),
            ].filter((element) => element.getClientRects().length > 0);
            const first = controls[0],
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <header className="assistant-header">
            <span className="assistant-brand">
              <BrandMark />
            </span>
            <div>
              <h2 id="assistant-title">{t('مساعد Lancelio')}</h2>
              <p id="assistant-description">{t('خطوة أوضح لشغلك')}</p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label={t('محادثة جديدة')}
              title={t('محادثة جديدة')}
              onClick={newConversation}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={t('إغلاق المساعد')}
              onClick={close}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="assistant-mode" role="status">
            <span className="assistant-mode-dot" />
            <span className="assistant-mode-text">
              {mode === 'openai' || mode === 'gemini'
                ? t('فهم ذكي للأسئلة')
                : mode === 'guided'
                  ? t('إرشادات واستعلامات محددة · الفهم الذكي لسه غير مفعّل')
                  : mode === 'unavailable'
                    ? t('المساعد غير متاح حاليًا')
                    : t('بنوصل بمساعدك…')}
            </span>
          </div>
          <div
            ref={transcript}
            className="assistant-transcript"
            role="log"
            aria-label={t('محادثتك مع المساعد')}
            aria-live="polite"
            aria-relevant="additions text"
            tabIndex={0}
          >
            {turns.length === 0 && (
              <section className="assistant-welcome">
                <span className="assistant-welcome-icon">
                  <MessageCircleMore size={30} aria-hidden="true" />
                </span>
                <span className="form-eyebrow">
                  LANCELIO / {t('معاك في الشغل')}
                </span>
                <h3>{t('خطوتك الجاية أوضح.')}</h3>
                <p>
                  {t(
                    'اسأل عن استخدام الموقع، أو اطلب ملخص شغلك والمشاريع والمستحقات.',
                  )}
                </p>
                <div className="assistant-suggestions">
                  {assistantSuggestions.map((suggestion) => {
                    const Icon = icons[suggestion.icon];
                    return (
                      <button
                        key={suggestion.icon}
                        type="button"
                        disabled={mode === null || mode === 'unavailable'}
                        onClick={() => {
                          void send(t(suggestion.label));
                        }}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{t(suggestion.label)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="assistant-welcome-footnote">
                  {t(
                    'الإجابات من مساحة عملك الحالية. المحادثة مؤقتة في التبويب ده، وبتتمسح عند تحديث الصفحة أو تسجيل الخروج.',
                  )}
                </p>
              </section>
            )}
            {turns.map((turn) => {
              const replyLocale = turn.locale ?? locale;
              const replyText = (message: string) =>
                translate(replyLocale, message);
              return (
                <div className="assistant-turn" key={turn.id}>
                  <div className="assistant-question">
                    <span className="sr-only">{t('أنت')}</span>
                    <p dir="auto">{turn.question}</p>
                  </div>
                  <div
                    className="assistant-message"
                    lang={replyLocale}
                    dir={replyLocale === 'ar' ? 'rtl' : 'ltr'}
                  >
                    <span className="assistant-message-icon">
                      <MessageCircleMore size={17} aria-hidden="true" />
                    </span>
                    <div>
                      {turn.pending ? (
                        <p className="assistant-pending" role="status">
                          <LoaderCircle
                            size={16}
                            className="spin"
                            aria-hidden="true"
                          />
                          {replyText('براجع سؤالك…')}
                        </p>
                      ) : turn.reply ? (
                        <AssistantAnswer
                          reply={turn.reply}
                          close={close}
                          locale={replyLocale}
                        />
                      ) : (
                        <div className="assistant-error">
                          <p
                            role={
                              turn.error === 'cancelled' ? 'status' : 'alert'
                            }
                          >
                            {turn.error === 'cancelled'
                              ? replyText('الطلب اتوقف.')
                              : turn.error === 'limited'
                                ? replyText(
                                    'وصلت لحد الأسئلة الحالي. استنى دقيقة وجرب تاني.',
                                  )
                                : replyText(
                                    'مش قادرين نجيب الرد دلوقتي. سؤالك محفوظ، جرّب تاني.',
                                  )}
                          </p>
                          <button
                            type="button"
                            className="text-button"
                            disabled={pending}
                            onClick={() => {
                              void send(turn.question, turn.id);
                            }}
                          >
                            {replyText('إعادة المحاولة')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <form className="assistant-composer" onSubmit={submit}>
            {mode === 'unavailable' && (
              <button
                type="button"
                className="text-button assistant-reconnect"
                onClick={() => {
                  setMode(null);
                  setAttempt((value) => value + 1);
                  input.current?.focus();
                }}
              >
                {t('إعادة الاتصال')}
              </button>
            )}
            <label className="sr-only" htmlFor="assistant-question">
              {t('سؤالك للمساعد')}
            </label>
            <div className="assistant-input-wrap">
              <textarea
                ref={input}
                id="assistant-question"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('اسأل عن شغلك…')}
                maxLength={1000}
                rows={2}
                dir="auto"
                disabled={turns.length >= 20}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              {pending ? (
                <button
                  key="stop"
                  type="button"
                  className="assistant-send"
                  aria-label={t('إيقاف الرد')}
                  onClick={(event) => {
                    event.preventDefault();
                    stop();
                  }}
                >
                  <Square size={16} aria-hidden="true" />
                </button>
              ) : (
                <button
                  key="send"
                  type="submit"
                  className="assistant-send"
                  aria-label={t('إرسال السؤال')}
                  disabled={
                    !draft.trim() ||
                    mode === null ||
                    mode === 'unavailable' ||
                    turns.length >= 20
                  }
                >
                  <Send size={18} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="assistant-composer-note">
              <span>
                {turns.length >= 20
                  ? t('ابدأ محادثة جديدة علشان تكمل أسئلتك.')
                  : t('للقراءة والإرشاد · راجع التفاصيل من روابط المصادر')}
              </span>
              {draft.length > 850 && (
                <span>{draft.length.toLocaleString(intlLocale)} / 1000</span>
              )}
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
