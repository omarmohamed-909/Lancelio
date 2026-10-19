'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ArrowDown,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleCheck,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Plus,
  ReceiptText,
  Users,
  X,
} from 'lucide-react';
import { Brand, BrandMark } from '../../../components/ui/brand';
import { LanguageSelect } from '../../../components/language/language-select';
import { ThemeToggle } from '../../../components/theme/theme-toggle';
import { useI18n } from '../../../i18n/language-provider';
import { useHydrated } from '../../../shared/hooks/use-hydrated';

const previewTabs = [
  { label: 'نظرة عامة', icon: LayoutDashboard },
  { label: 'المشاريع', icon: FolderKanban },
  { label: 'الفواتير', icon: ReceiptText },
] as const;
const journey = [
  {
    icon: Users,
    title: 'ضيف العميل',
    text: 'احتفظ ببياناته، وخلي كل شغلك معاه في مكان واحد.',
  },
  {
    icon: FileText,
    title: 'وضّح الاتفاق',
    text: 'جهّز عرض السعر، وشارك النطاق والتكلفة للموافقة.',
  },
  {
    icon: FolderKanban,
    title: 'حرّك المشروع',
    text: 'حوّل الاتفاق لمشروع، وقسّم الشغل لمهام واضحة.',
  },
  {
    icon: ReceiptText,
    title: 'اقفل الدائرة',
    text: 'شارك الفاتورة، وسجّل الدفعات، وتابع اللي باقي.',
  },
] as const;
const questions = [
  [
    'Lancelio مناسب لمين؟',
    'للمستقلين وأصحاب الاستوديوهات الصغيرة اللي عايزين ينظموا علاقتهم بالعملاء، ويتابعوا المشاريع والفواتير في مساحة واحدة.',
  ],
  [
    'العميل محتاج يعمل حساب؟',
    'تقدر تشارك عرض السعر أو الفاتورة أو بوابة العميل برابط مخصص، والعميل يفتح الرابط من غير حساب. وإنت تتحكم في صلاحية المشاركة.',
  ],
  [
    'ينفع أستخدمه بالعربي والإنجليزي؟',
    'أيوه. الواجهة بتبدأ بلغة جهازك المدعومة، وتقدر تغيّر بين العربي والإنجليزي من اختيار اللغة في أي وقت.',
  ],
  [
    'هل Lancelio بيحصّل الفلوس من العميل؟',
    'Lancelio بيساعدك تصدر الفواتير وتسجّل الدفعات وتتابع المستحقات. تحويل الفلوس نفسه بيتم بالطريقة اللي إنت وعميلك متفقين عليها.',
  ],
  [
    'أبدأ منين؟',
    'اعمل حساب ومساحة عمل، وبعدها ضيف أول عميل. تقدر تبدأ بعرض سعر، أو تنظّم مشروع موجود عندك بالفعل.',
  ],
] as const;

function DirectionArrow() {
  const { locale } = useI18n();
  const Icon = locale === 'ar' ? ArrowUpLeft : ArrowUpRight;
  return <Icon size={19} aria-hidden="true" />;
}

function WorkspacePreview() {
  const { t, intlLocale, locale } = useI18n();
  const ready = useHydrated();
  const [active, setActive] = useState(0);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const visual = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const playing = motionAllowed && !paused && !hovered && !focused && visible;
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotionAllowed(!media.matches);
    update();
    media.addEventListener('change', update);
    const surface = visual.current;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setVisible(
          Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.45) &&
            !document.hidden,
        ),
      { threshold: 0.45 },
    );
    if (surface) observer.observe(surface);
    const visibility = () => {
      if (document.hidden) setVisible(false);
      else if (surface) {
        observer.unobserve(surface);
        observer.observe(surface);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setActive((current) => (current + 1) % previewTabs.length),
      6500,
    );
    return () => window.clearTimeout(timer);
  }, [active, playing]);
  useEffect(() => {
    const surface = visual.current;
    if (!surface || !motionAllowed) return;
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0;
    const reset = () => {
      window.cancelAnimationFrame(frame);
      surface.style.removeProperty('--preview-tilt-x');
      surface.style.removeProperty('--preview-tilt-y');
      surface.style.removeProperty('--orbit-shift-x');
      surface.style.removeProperty('--orbit-shift-y');
    };
    const move = (event: PointerEvent) => {
      if (!pointer.matches || event.pointerType !== 'mouse') return;
      const bounds = surface.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const overPreview = (event.target as Element).closest(
          '.landing-preview-main',
        );
        surface.style.setProperty(
          '--preview-tilt-x',
          `${overPreview ? -y * 3 : 0}deg`,
        );
        surface.style.setProperty(
          '--preview-tilt-y',
          `${overPreview ? x * 3 : 0}deg`,
        );
        surface.style.setProperty('--orbit-shift-x', `${x * 12}px`);
        surface.style.setProperty('--orbit-shift-y', `${y * 12}px`);
      });
    };
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerleave', reset);
    return () => {
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', reset);
      reset();
    };
  }, [motionAllowed]);
  const number = (value: number) =>
    new Intl.NumberFormat(intlLocale).format(value);
  const money = (value: number) =>
    new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(value);
  function changeTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = previewTabs.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const direction =
        (event.key === 'ArrowRight') === (locale === 'en') ? 1 : -1;
      next = (index + direction + previewTabs.length) % previewTabs.length;
    } else return;
    event.preventDefault();
    setPaused(true);
    setActive(next);
    tabs.current[next]?.focus();
  }
  return (
    <div
      className="landing-visual"
      id="workspace-preview"
      ref={visual}
      data-playing={playing}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className="landing-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="landing-preview">
        <div className="landing-preview-chrome">
          <span className="landing-preview-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div className="landing-preview-controls">
            <div
              className="landing-preview-tabs"
              role="tablist"
              aria-label={t('نظرة أقرب على Lancelio')}
            >
              {previewTabs.map(({ label, icon: Icon }, index) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  disabled={!ready}
                  id={`preview-tab-${index}`}
                  aria-selected={active === index}
                  aria-controls={`preview-panel-${index}`}
                  tabIndex={active === index ? 0 : -1}
                  ref={(element) => {
                    tabs.current[index] = element;
                  }}
                  onClick={() => {
                    setPaused(true);
                    setActive(index);
                  }}
                  onKeyDown={(event) => changeTab(event, index)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
          <span className="landing-preview-sample">{t('بيانات توضيحية')}</span>
        </div>
        <div className="landing-preview-sidebar" aria-hidden="true">
          <div className="landing-mini-brand">
            <BrandMark light />
            <span dir="ltr">lancelio.</span>
          </div>
          <div className="landing-mini-workspace">
            <span>N</span>
            <span>
              {t('استوديو نواة')}
              <small>{t('مساحة العمل')}</small>
            </span>
          </div>
          {[
            { label: 'نظرة عامة', icon: LayoutDashboard },
            { label: 'العملاء', icon: Users },
            { label: 'عروض الأسعار', icon: FileText },
            { label: 'المشاريع', icon: FolderKanban },
            { label: 'الفواتير', icon: ReceiptText },
          ].map(({ label, icon: Icon }) => (
            <div
              key={label}
              className={
                label === previewTabs[active]!.label ? 'is-selected' : ''
              }
            >
              <Icon size={14} />
              {t(label)}
            </div>
          ))}
          <span className="landing-mini-sidebar-bottom">
            <span className="landing-status-dot" />
            {t('شغلك، بإيقاع أهدى.')}
          </span>
        </div>
        <div className="landing-preview-main">
          <div className="landing-preview-panels">
            {previewTabs.map((tab, panel) => (
              <div
                className={`landing-preview-content${active === panel ? ' is-active' : ''}`}
                key={tab.label}
                role="tabpanel"
                id={`preview-panel-${panel}`}
                aria-labelledby={`preview-tab-${panel}`}
                aria-hidden={active !== panel}
                inert={active !== panel}
                tabIndex={active === panel ? 0 : -1}
              >
                <div className="landing-preview-greeting">
                  <span>{t('استوديو نواة')}</span>
                  <strong>
                    {t(
                      panel === 0
                        ? 'صباح الشغل الحلو.'
                        : panel === 1
                          ? 'شغلك ماشي لقدّام'
                          : 'حقك واضح، في كل فاتورة.',
                    )}
                  </strong>
                  <p>{t('كل التفاصيل قريبة. والخطوة الجاية واضحة.')}</p>
                </div>
                <div className="landing-preview-metrics">
                  <div>
                    <span>
                      {t(panel === 2 ? 'إجمالي الفاتورة' : 'قيمة الشغل الجاري')}
                    </span>
                    <strong>{money(24000)}</strong>
                    <small>
                      <span className="landing-status-dot" />
                      {t(panel === 2 ? 'تم تسجيل الدفعة' : 'قيد التنفيذ')}
                    </small>
                  </div>
                  <div>
                    <span>{t(panel === 2 ? 'المدفوع' : 'مشاريع بتتحرك')}</span>
                    <strong>
                      {panel === 2 ? money(12000) : number(3)}
                      <span
                        className="landing-metric-decoration"
                        aria-hidden="true"
                      >
                        ↗
                      </span>
                    </strong>
                    <small>
                      {t(panel === 2 ? 'المتبقي' : 'الخطوات المكتملة')} ·{' '}
                      {panel === 2 ? money(12000) : number(8)}
                    </small>
                  </div>
                </div>
                {panel === 0 ? (
                  <>
                    <div className="landing-preview-project">
                      <div>
                        <span className="landing-project-symbol">
                          N<span />
                        </span>
                        <span>
                          <strong>{t('هوية نواة البصرية')}</strong>
                          <small>{t('قيد التنفيذ')}</small>
                        </span>
                        <span className="landing-preview-percent">
                          {number(75)}%
                        </span>
                      </div>
                      <div className="landing-mini-progress">
                        <span style={{ width: '75%' }} />
                      </div>
                    </div>
                    <div className="landing-preview-tasks">
                      <strong>{t('المهام الأقرب')}</strong>
                      <div>
                        <span className="landing-mini-checkbox is-checked">
                          <Check size={11} aria-hidden="true" />
                        </span>
                        {t('مراجعة الهوية مع العميل')}
                        <small>{t('اليوم')}</small>
                      </div>
                      <div>
                        <span className="landing-mini-checkbox" />
                        {t('تجهيز ملفات التسليم')}
                        <small>{t('غدًا')}</small>
                      </div>
                    </div>
                  </>
                ) : panel === 1 ? (
                  <div className="landing-preview-projects">
                    {[
                      'هوية نواة البصرية',
                      'تصميم متجر مدار',
                      'موقع أُفق الجديد',
                    ].map((name, index) => (
                      <div key={name}>
                        <span
                          className={`landing-project-letter tone-${index}`}
                          aria-hidden="true"
                        >
                          {['N', 'M', 'O'][index]}
                        </span>
                        <span>
                          <strong>{t(name)}</strong>
                          <small>
                            {t(index === 2 ? 'مكتمل' : 'قيد التنفيذ')}
                          </small>
                        </span>
                        <span>{number([75, 40, 100][index]!)}%</span>
                        <div className="landing-mini-progress">
                          <span style={{ width: `${[75, 40, 100][index]}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="landing-preview-invoice">
                    <div>
                      <ReceiptText size={21} aria-hidden="true" />
                      <span>
                        <strong>{t('فاتورة هوية نواة')}</strong>
                        <small dir="ltr">INV—0024</small>
                      </span>
                    </div>
                    <div>
                      <span>{t('إجمالي الفاتورة')}</span>
                      <strong>{money(24000)}</strong>
                    </div>
                    <div>
                      <span>{t('المدفوع')}</span>
                      <strong>{money(12000)}</strong>
                    </div>
                    <div className="landing-invoice-balance">
                      <span>{t('المتبقي')}</span>
                      <strong>{money(12000)}</strong>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="landing-preview-footer">
        <div className="landing-payment-note" aria-hidden="true">
          <span>
            <CheckCheck size={20} />
          </span>
          <div>
            <strong>{t('الفاتورة اتسددت.')}</strong>
            <small>{t('تفصيلة أقل في بالك.')}</small>
          </div>
        </div>
        <div className="landing-preview-meta">
          <p className="landing-preview-caption">
            {t('معاينة تفاعلية ببيانات توضيحية')}
          </p>
          <button
            className="landing-motion-control"
            type="button"
            disabled={!ready || !motionAllowed}
            onClick={() => setPaused(!paused)}
          >
            {t(paused ? 'متابعة الحركة' : 'إيقاف الحركة')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ returning = false }: { returning?: boolean }) {
  const { t } = useI18n();
  const entryHref = returning ? '/dashboard' : '/register';
  const entryLabel = t(returning ? 'افتح مساحة العمل' : 'ابدأ مساحتك');
  const ready = useHydrated();
  const root = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuButton.current?.closest('header')?.contains(event.target)
      )
        setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [menuOpen]);
  useEffect(() => {
    const surface = root.current;
    if (!surface || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations: Animation[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          if (!preference.matches)
            animations.push(
              entry.target.animate(
                [
                  { opacity: 0, transform: 'translateY(24px)' },
                  { opacity: 1, transform: 'translateY(0)' },
                ],
                { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' },
              ),
            );
        }
      },
      { threshold: 0.12 },
    );
    surface
      .querySelectorAll('[data-land-reveal]')
      .forEach((element) => observer.observe(element));
    const reduce = () => {
      if (preference.matches)
        animations.forEach((animation) => animation.cancel());
    };
    preference.addEventListener('change', reduce);
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      preference.removeEventListener('change', reduce);
    };
  }, []);
  const navItems = [
    ['#features', 'ليه Lancelio؟'],
    ['#how-it-works', 'رحلة الشغل'],
    ['#questions', 'أسئلة بتتكرر'],
  ] as const;
  return (
    <div className="landing" ref={root}>
      <header
        className="landing-header"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <div className="landing-container landing-header-inner">
          <Brand />
          <nav className="landing-desktop-nav" aria-label={t('التنقل الرئيسي')}>
            {navItems.map(([href, label]) => (
              <a key={href} href={href}>
                {t(label)}
              </a>
            ))}
          </nav>
          <div className="landing-header-actions">
            <LanguageSelect />
            <span className="landing-desktop-theme">
              <ThemeToggle />
            </span>
            {!returning && (
              <Link href="/login" className="landing-login">
                {t('تسجيل الدخول')}
              </Link>
            )}
            <Link
              href={entryHref}
              className="landing-button landing-header-cta"
            >
              {returning ? entryLabel : t('ابدأ الآن')}
              <DirectionArrow />
            </Link>
            <button
              ref={menuButton}
              disabled={!ready}
              className="landing-menu-toggle"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-navigation"
              aria-label={t(menuOpen ? 'اقفل القائمة' : 'افتح القائمة')}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? (
                <X size={21} aria-hidden="true" />
              ) : (
                <Menu size={21} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <nav
          id="landing-mobile-navigation"
          className="landing-mobile-nav"
          aria-label={t('التنقل الرئيسي')}
          hidden={!menuOpen}
        >
          {navItems.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>
              {t(label)}
              <DirectionArrow />
            </a>
          ))}
          {!returning && (
            <Link href="/login">
              {t('تسجيل الدخول')}
              <DirectionArrow />
            </Link>
          )}
          <div>
            <Link href={entryHref} className="landing-button">
              {entryLabel}
              <DirectionArrow />
            </Link>
            <ThemeToggle />
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section
          className="landing-hero landing-container"
          aria-labelledby="landing-title"
        >
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">
              <span />
              {t('للشغل المستقل اللي بيكبر')}
            </span>
            <h1 id="landing-title">
              {t('شغلك طموح.')}
              <br />
              <span>{t('خلّي إدارته أبسط.')}</span>
            </h1>
            <p className="landing-hero-description">
              {t(
                'أفكارك تستاهل وقتك. اجمع عملاءك، واتفاقاتك، ومشاريعك، وفواتيرك في مساحة واحدة تعرف منها إنت واقف فين والخطوة الجاية إيه.',
              )}
            </p>
            <div className="landing-hero-actions">
              <Link href={entryHref} className="landing-button">
                {entryLabel}
                <DirectionArrow />
              </Link>
              <a href="#features" className="landing-text-link">
                {t('اكتشف المساحة')}
                <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="landing-hero-footnote">
              <span className="landing-overlapping-icons" aria-hidden="true">
                <FileText size={17} />
                <FolderKanban size={17} />
                <ReceiptText size={17} />
              </span>
              {t('من أول اتفاق، لآخر تحصيل.')}
            </p>
          </div>
          <WorkspacePreview />
        </section>

        <section
          className="landing-flow-strip"
          aria-label={t('من أول اتفاق، لآخر تحصيل.')}
        >
          <div className="landing-container">
            <span>{t('شغلك، بإيقاع أهدى.')}</span>
            <div>
              {[
                'اتفق بوضوح',
                'نفّذ بترتيب',
                'فوّتِر باحتراف',
                'تابع مستحقاتك',
              ].map((text, index) => (
                <span key={text}>
                  <small dir="ltr">0{index + 1}</small>
                  {t(text)}
                  {index < 3 && (
                    <span className="landing-flow-line" aria-hidden="true" />
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section
          id="features"
          className="landing-features landing-container"
          aria-labelledby="landing-features-title"
        >
          <div className="landing-section-heading" data-land-reveal>
            <div>
              <span className="landing-eyebrow">
                {t('أقل تنقّل بين الأدوات. مساحة أكبر للشغل اللي بتحبه.')}
              </span>
              <h2 id="landing-features-title">
                {t('من الفكرة للتسليم،')}
                <br />
                <span>{t('كل حاجة واخدة مكانها.')}</span>
              </h2>
            </div>
            <p>
              {t(
                'مش مجرد قائمة مهام. دي صورة متصلة لشغلك، من أول عرض سعر لحد آخر دفعة.',
              )}
            </p>
          </div>
          <div className="landing-feature-grid">
            <article
              className="landing-feature landing-feature-proposal"
              data-land-reveal
            >
              <div className="landing-feature-copy">
                <span className="landing-feature-icon">
                  <FileText size={23} aria-hidden="true" />
                </span>
                <h3>{t('اتفاق يفتح الطريق.')}</h3>
                <p>
                  {t(
                    'ابعت عرض سعر واضح، وحدد النطاق والبنود. لما العميل يوافق، حوّل الاتفاق لمشروع وابدأ على أساس متين.',
                  )}
                </p>
              </div>
              <div className="landing-proposal-scene" aria-hidden="true">
                <div className="landing-proposal-paper">
                  <div>
                    <BrandMark />
                    <span dir="ltr">PROP / 024</span>
                  </div>
                  <small>{t('عرض سعر · هوية بصرية')}</small>
                  <strong>{t('هوية تشبه الفكرة.')}</strong>
                  <div className="landing-proposal-items">
                    {[
                      'الاستراتيجية والتوجّه البصري',
                      'الشعار وتطبيقات الهوية',
                      'دليل استخدام الهوية',
                    ].map((item, index) => (
                      <span key={item}>
                        <i>0{index + 1}</i>
                        {t(item)}
                        <Check size={13} />
                      </span>
                    ))}
                  </div>
                  <div className="landing-proposal-footer">
                    <div className="landing-proposal-signature">
                      <span>{t('استوديو نواة')}</span>
                      <em dir="ltr">Nawa.</em>
                    </div>
                    <span className="landing-approval-stamp">
                      <CircleCheck size={17} />
                      {t('مقبول')}
                    </span>
                  </div>
                </div>
                <span className="landing-proposal-caption">
                  {t('اتفاق واضح، بداية أحسن.')}
                </span>
              </div>
            </article>
            <article
              className="landing-feature landing-feature-projects"
              data-land-reveal
            >
              <div className="landing-feature-copy">
                <span className="landing-feature-icon">
                  <FolderKanban size={23} aria-hidden="true" />
                </span>
                <h3>{t('كل مشروع، على مساره.')}</h3>
                <p>
                  {t(
                    'رتّب المهام، وحدد مواعيدها، وتابع التقدّم. التفاصيل الصغيرة جنب الصورة الكبيرة، من غير ما حاجة تقع منك.',
                  )}
                </p>
              </div>
              <div className="landing-task-scene" aria-hidden="true">
                <div>
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-task-ticket">
                  <span className="landing-task-tag">
                    {t('هوية نواة البصرية')}
                  </span>
                  <strong>{t('مراجعة الهوية مع العميل')}</strong>
                  <span className="landing-task-ticket-bottom">
                    <span>
                      <span>N</span>
                      <span>M</span>
                    </span>
                    <span>
                      <CircleCheck size={13} /> 3 / 4
                    </span>
                  </span>
                  <span className="landing-mini-progress">
                    <span style={{ width: '75%' }} />
                  </span>
                </div>
                <div className="landing-done-task">
                  <CircleCheck size={17} />
                  {t('تجهيز ملفات التسليم')}
                  <CheckCheck size={16} />
                </div>
              </div>
            </article>
            <article
              className="landing-feature landing-feature-invoices"
              data-land-reveal
            >
              <div className="landing-feature-copy">
                <span className="landing-feature-icon">
                  <ReceiptText size={23} aria-hidden="true" />
                </span>
                <h3>{t('حقك واضح، في كل فاتورة.')}</h3>
                <p>
                  {t(
                    'اعمل فاتورة من شغلك، وشاركها مع العميل. سجّل الدفعات وتابع المتبقي، مع تفاصيل ترجع لها وقت ما تحتاج.',
                  )}
                </p>
              </div>
              <div className="landing-invoice-scene" aria-hidden="true">
                <div>
                  <span>{t('فاتورة المشروع')}</span>
                  <span dir="ltr">INV—0024</span>
                </div>
                <strong dir="ltr">
                  24,000 <small>EGP</small>
                </strong>
                <div className="landing-invoice-track">
                  <span />
                  <span />
                </div>
                <div className="landing-invoice-breakdown">
                  <span>
                    <i />
                    {t('المدفوع')}
                    <b dir="ltr">12,000</b>
                  </span>
                  <span>
                    <i />
                    {t('المتبقي')}
                    <b dir="ltr">12,000</b>
                  </span>
                </div>
              </div>
            </article>
            <article
              className="landing-feature landing-feature-portal"
              data-land-reveal
            >
              <div className="landing-feature-copy">
                <span className="landing-feature-icon">
                  <Users size={23} aria-hidden="true" />
                </span>
                <h3>{t('عميلك شايف الصورة.')}</h3>
                <p>
                  {t(
                    'شارك بوابة تجمع حالة المشروع والمهام والفواتير. عميلك يتابع، وإنت تركز في الشغل.',
                  )}
                </p>
              </div>
              <div className="landing-portal-scene" aria-hidden="true">
                <div className="landing-portal-people">
                  <span>N</span>
                  <span>
                    <CheckCheck size={23} />
                  </span>
                  <span>M</span>
                </div>
                <strong>{t('مساحة أوضح، للطرفين.')}</strong>
                <span className="landing-portal-tags">
                  <span>
                    <FolderKanban size={13} />
                    {t('المشاريع')}
                  </span>
                  <span>
                    <ReceiptText size={13} />
                    {t('الفواتير')}
                  </span>
                </span>
              </div>
            </article>
          </div>
        </section>

        <section
          className="landing-assistant-section landing-container"
          aria-labelledby="landing-assistant-title"
          data-land-reveal
        >
          <div className="landing-assistant">
            <div className="landing-assistant-copy">
              <span className="landing-eyebrow">
                {t('مساعدك، جوّه الصورة.')}
              </span>
              <h2 id="landing-assistant-title">
                {t('فكرة محتاجة ترتيب؟')}
                <br />
                <span>{t('اسأل، وكمّل شغلك.')}</span>
              </h2>
              <p>
                {t(
                  'اسأل عن مشاريعك وفواتيرك، استكشف إمكانيات Lancelio، أو رتّب فكرة للخطوة الجاية. المساعد قريب، وقت ما تحتاجه.',
                )}
              </p>
              <Link href={entryHref} className="landing-text-link">
                {entryLabel}
                <DirectionArrow />
              </Link>
            </div>
            <div className="landing-chat-preview">
              <span className="landing-chat-label">
                <MessageCircle size={16} aria-hidden="true" />
                {t('مثال على المحادثة')}
              </span>
              <div className="landing-chat-question">
                {t('إيه اللي محتاج انتباهي النهارده؟')}
              </div>
              <div className="landing-chat-answer">
                <span className="landing-chat-mark">
                  <BrandMark />
                </span>
                <div>
                  <strong dir="ltr" lang="en">
                    Lancelio assistant
                  </strong>
                  <p>
                    {t(
                      'نبدأ بمراجعة هوية نواة، وبعدها تجهيز ملفات التسليم. تحب نشوف تفاصيل المشروع؟',
                    )}
                  </p>
                  <span>
                    <FolderKanban size={13} aria-hidden="true" />
                    {t('هوية نواة البصرية')}
                  </span>
                </div>
              </div>
              <span className="landing-chat-decoration" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="landing-journey landing-container"
          aria-labelledby="landing-journey-title"
        >
          <div className="landing-section-heading" data-land-reveal>
            <div>
              <span className="landing-eyebrow">{t('شغلك له رحلة.')}</span>
              <h2 id="landing-journey-title">{t('ابدأها صح، وكمّل براحة.')}</h2>
            </div>
            <p>{t('من أول عميل لآخر دفعة، خطوات متصلة بدل تفاصيل متفرقة.')}</p>
          </div>
          <div className="landing-journey-grid">
            {journey.map(({ icon: Icon, title, text }, index) => (
              <article key={title} data-land-reveal>
                <span className="landing-journey-number" dir="ltr">
                  0{index + 1}
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="questions"
          className="landing-faq landing-container"
          aria-labelledby="landing-faq-title"
        >
          <div data-land-reveal>
            <span className="landing-eyebrow">{t('قبل ما تبدأ.')}</span>
            <h2 id="landing-faq-title">{t('أسئلة بتتكرر')}</h2>
            <p>{t('شوية إجابات تقرّب الصورة.')}</p>
            <span className="landing-faq-art" aria-hidden="true">
              ?<span />
            </span>
          </div>
          <div className="landing-faq-list" data-land-reveal>
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {t(question)}
                  <Plus size={20} aria-hidden="true" />
                </summary>
                <p>{t(answer)}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="landing-finale"
          aria-labelledby="landing-finale-title"
        >
          <div className="landing-container" data-land-reveal>
            <span className="landing-finale-emblem" aria-hidden="true">
              <BrandMark light />
            </span>
            <span className="landing-eyebrow" dir="ltr">
              WORK, IN ORDER.
            </span>
            <h2 id="landing-finale-title">
              {t('مساحة لشغلك.')}
              <br />
              <span>{t('ومساحة لنفسك.')}</span>
            </h2>
            <p>{t('خلّي التفاصيل في مكانها، وارجع للي بتحب تعمله.')}</p>
            <Link
              href={entryHref}
              className="landing-button landing-button-light"
            >
              {entryLabel}
              <DirectionArrow />
            </Link>
            {!returning && (
              <span className="landing-finale-login">
                {t('عندك حساب بالفعل؟')}{' '}
                <Link href="/login">{t('تسجيل الدخول')}</Link>
              </span>
            )}
          </div>
          <span className="landing-finale-orbit" aria-hidden="true" />
        </section>
      </main>
      <footer className="landing-footer landing-container">
        <div>
          <Brand />
          <p>{t('مصمّم لمساحة أوضح في يومك.')}</p>
        </div>
        <nav aria-label={t('استكشف Lancelio')}>
          {navItems.map(([href, label]) => (
            <a key={href} href={href}>
              {t(label)}
            </a>
          ))}
          <Link href={returning ? '/dashboard' : '/login'}>
            {returning ? entryLabel : t('تسجيل الدخول')}
          </Link>
        </nav>
        <span dir="ltr">© {new Date().getFullYear()} Lancelio.</span>
      </footer>
    </div>
  );
}
