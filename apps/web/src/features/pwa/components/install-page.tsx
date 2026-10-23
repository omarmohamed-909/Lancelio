'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Download,
  Monitor,
  RefreshCw,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { Brand } from '../../../components/ui/brand';
import { LanguageSelect } from '../../../components/language/language-select';
import { ThemeToggle } from '../../../components/theme/theme-toggle';
import { LegalLinks } from '../../legal/components/legal-links';
import { useI18n } from '../../../i18n/language-provider';
import { usePwa } from './pwa-provider';

const devices = [
  {
    id: 'ios',
    label: 'iPhone وiPad',
    icon: Smartphone,
    steps: [
      'افتح الموقع في Safari، وافتح قائمة الصفحة أو زر المشاركة.',
      'اختار «إضافة إلى الشاشة الرئيسية».',
      'فعّل «فتح كتطبيق ويب» لو ظهر، وبعدها اضغط «إضافة».',
    ],
  },
  {
    id: 'android',
    label: 'Android',
    icon: Smartphone,
    steps: [
      'افتح الموقع في Chrome أو متصفح بيدعم تثبيت التطبيقات.',
      'افتح قائمة المتصفح، واختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
      'أكّد التثبيت، وبعدها افتح Lancelio من الأيقونة.',
    ],
  },
  {
    id: 'desktop',
    label: 'الكمبيوتر',
    icon: Monitor,
    steps: [
      'في Chrome أو Edge، افتح الموقع وابحث عن أيقونة التثبيت في شريط العنوان أو قائمة المتصفح.',
      'على Mac، تقدر تستخدم Safari وتختار «إضافة إلى Dock» من قائمة «ملف» لو متاحة.',
      'لو الخيار مش موجود، استخدم متصفحًا بيدعم تثبيت تطبيقات الويب.',
    ],
  },
] as const;

export function InstallPage() {
  const { t } = useI18n();
  const pwa = usePwa();
  const [device, setDevice] = useState<'ios' | 'android' | 'desktop'>(
    'desktop',
  );
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const apple =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setDevice(
        apple
          ? 'ios'
          : /Android/.test(navigator.userAgent)
            ? 'android'
            : 'desktop',
      );
    });
    return () => {
      active = false;
    };
  }, []);
  const instructions = devices.find((item) => item.id === device)!;
  const workerText = {
    pending: 'جاري تجهيز شاشة انقطاع الاتصال…',
    ready: 'شاشة انقطاع الاتصال جاهزة.',
    unsupported: 'تجهيز وضع الانقطاع بيعمل في النسخة المنشورة على اتصال آمن.',
    failed: 'تعذّر تجهيز شاشة الانقطاع. حاول تحديث الصفحة وأنت متصل.',
  }[pwa.workerStatus];
  const updateText = {
    idle: '',
    checking: 'جاري التحقق…',
    current: 'ملفات التشغيل محدثة.',
    waiting: 'تحديث جاهز. احفظ شغلك واقفل نوافذ التطبيق وافتحه من جديد.',
    failed: 'تعذّر التحقق من التحديث. جرّب وأنت متصل بالإنترنت.',
  }[pwa.updateStatus];
  const installText = {
    idle: '',
    prompting: 'جاري فتح طلب التثبيت…',
    accepted: 'تم إرسال طلب التثبيت للمتصفح. تابع الخطوات اللي بتظهر لك.',
    dismissed: 'تقدر تثبّته في أي وقت من قائمة المتصفح.',
    failed: 'تعذّر فتح طلب التثبيت. استخدم خطوات المتصفح الموضّحة هنا.',
  }[pwa.installStatus];
  return (
    <div className="install-site">
      <header className="install-header install-container">
        <Brand />
        <div>
          <Link href="/" className="install-home">
            {t('العودة للرئيسية')}
          </Link>
          <LanguageSelect />
          <ThemeToggle />
        </div>
      </header>
      <main className="install-container" id="main-content">
        <section className="install-hero" aria-labelledby="install-title">
          <div>
            <span className="install-eyebrow">
              <span aria-hidden="true" />
              {t('تثبيت التطبيق')}
            </span>
            <h1 id="install-title">{t('خد Lancelio معاك.')}</h1>
            <p>
              {t(
                'افتح مساحة شغلك من الشاشة الرئيسية، في نافذة مستقلة وبحسابك المعتاد.',
              )}
            </p>
            <Link href="/dashboard" className="install-workspace-link">
              {t('افتح مساحة العمل')}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="install-app-card">
            <Image
              src="/pwa/icon-192.png"
              width={96}
              height={96}
              alt=""
              className="install-app-icon"
              unoptimized
              priority
            />
            <h2>
              {pwa.installed
                ? t('التطبيق مثبت على جهازك.')
                : t('تثبيت Lancelio')}
            </h2>
            <p>
              {pwa.installed
                ? t(
                    'تقدر تفتحه من الأيقونة على الشاشة الرئيسية أو قائمة التطبيقات.',
                  )
                : pwa.canInstall
                  ? t('التثبيت متاح من المتصفح ده.')
                  : t(
                      'لو زر التثبيت مش ظاهر، اتبع الخطوات المناسبة لجهازك. التثبيت بيختلف حسب المتصفح.',
                    )}
            </p>
            {pwa.canInstall && !pwa.installed && (
              <button
                className="install-primary"
                type="button"
                onClick={() => {
                  void pwa.install();
                }}
                disabled={pwa.installStatus === 'prompting'}
              >
                <Download size={18} aria-hidden="true" />
                {t('ثبّت على جهازك')}
              </button>
            )}
            {pwa.installed && (
              <span className="install-confirmed">
                <Check size={18} aria-hidden="true" />
                Lancelio
              </span>
            )}
            <p className="install-status" role="status">
              {!pwa.installed && t(installText)}
            </p>
          </div>
        </section>
        <div className="install-benefits">
          {[
            {
              icon: Smartphone,
              title: 'من الشاشة الرئيسية',
              text: 'أيقونة واحدة توصّلك لمساحة العمل.',
            },
            {
              icon: Monitor,
              title: 'مساحة مستقلة لشغلك',
              text: 'واجهة مألوفة، من غير زحمة تبويبات.',
            },
            {
              icon: WifiOff,
              title: 'واضح حتى وقت الانقطاع',
              text: 'شاشة خفيفة تساعدك ترجع لما الاتصال يتحسن.',
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon size={22} aria-hidden="true" />
              <div>
                <h2>{t(title)}</h2>
                <p>{t(text)}</p>
              </div>
            </div>
          ))}
        </div>
        <section
          className="install-instructions"
          aria-labelledby="install-steps-title"
        >
          <div>
            <span className="install-eyebrow" dir="ltr">
              LANCELIO / ON YOUR DEVICE
            </span>
            <h2 id="install-steps-title">{t('خطوات التثبيت')}</h2>
            <div
              className="install-devices"
              role="group"
              aria-label={t('جهاز التثبيت')}
            >
              {devices.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={device === id}
                  onClick={() => setDevice(id)}
                >
                  <Icon size={17} aria-hidden="true" />
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
          <ol data-device={device}>
            {instructions.steps.map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">0{index + 1}</span>
                <p>{t(step)}</p>
              </li>
            ))}
          </ol>
        </section>
        <div className="install-details">
          <section aria-labelledby="install-offline-title">
            <WifiOff size={22} aria-hidden="true" />
            <h2 id="install-offline-title">{t('العمل وقت انقطاع الاتصال')}</h2>
            <p>
              {t(
                'عرض وتعديل بيانات الشغل محتاج إنترنت. التطبيق بيحفظ شاشة الانقطاع والأيقونات فقط، وبيحتاج يتفتح مرة وأنت متصل لتجهيزهم.',
              )}
            </p>
            <p
              className="install-status"
              role="status"
              data-worker-status={pwa.workerStatus}
            >
              {t(workerText)}
            </p>
          </section>
          <section aria-labelledby="install-updates-title">
            <RefreshCw size={22} aria-hidden="true" />
            <h2 id="install-updates-title">{t('تحديثات التطبيق')}</h2>
            <p>
              {t(
                'التحديثات بتوصل مع الاستخدام. لو فيه نسخة جديدة للتشغيل، اقفل نوافذ Lancelio المفتوحة وافتحه من جديد بعد حفظ شغلك.',
              )}
            </p>
            <button
              type="button"
              className="install-update"
              disabled={
                pwa.workerStatus !== 'ready' || pwa.updateStatus === 'checking'
              }
              onClick={() => {
                void pwa.checkUpdate();
              }}
            >
              {t('التحقق من تحديث التطبيق')}
            </button>
            <p className="install-status" role="status">
              {t(updateText)}
            </p>
          </section>
        </div>
      </main>
      <footer className="install-footer install-container">
        <LegalLinks />
        <Link href="/">{t('العودة للرئيسية')}</Link>
      </footer>
    </div>
  );
}
