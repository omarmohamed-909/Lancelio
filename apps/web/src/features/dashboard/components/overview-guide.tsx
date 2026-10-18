'use client';
import { useI18n } from '../../../i18n/language-provider';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpLeft,
  ChevronDown,
  FileText,
  FolderKanban,
  Lightbulb,
  Users,
  Wallet,
} from 'lucide-react';
const steps = [
  {
    label: 'العملاء',
    question: 'مين هتشتغل معاه؟',
    icon: Users,
    text: 'احفظ اسم العميل وطرق التواصل معاه. كل عروضه ومشاريعه وفواتيره بتتربط بيه، فتلاقي تفاصيل الشغل في مكان واحد.',
    href: '/clients',
    action: 'افتح دفتر العملاء',
  },
  {
    label: 'عروض الأسعار',
    question: 'متفقين على إيه؟',
    icon: FileText,
    text: 'اكتب نطاق الشغل والسعر والشروط، وراجعهم قبل المشاركة. لما العميل يقبل العرض، المشروع بيتفتح من نفس الاتفاق.',
    href: '/proposals',
    action: 'راجع عروض الأسعار',
  },
  {
    label: 'المشاريع',
    question: 'وصلت لفين في التنفيذ؟',
    icon: FolderKanban,
    text: 'قسّم الشغل لمهام: لسه، قيد التنفيذ، وخلصت. حالة المشروع مستقلة عن المهام؛ والعميل يشوف بس المهام اللي تسمح بعرضها.',
    href: '/projects',
    action: 'افتح المشاريع',
  },
  {
    label: 'الفواتير',
    question: 'اتقبض كام وباقي كام؟',
    icon: Wallet,
    text: 'أصدر الفاتورة وسجّل الدفعات اللي استلمتها. النظرة العامة تجمع الصادر والمقبوض والمتبقي، وكل عملة في حساب منفصل.',
    href: '/invoices',
    action: 'راجع الفواتير',
  },
] as const;
export function OverviewGuide() {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const step = steps[selected]!;
  return (
    <details className="overview-guide">
      <summary>
        <span>
          <Lightbulb size={18} aria-hidden="true" />{' '}
          {t('إزاي تستخدم المساحة؟')}{' '}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="overview-guide-body">
        <p>{t('اختار مرحلة، وشوف دورها في الشغل.')}</p>
        <div className="overview-guide-steps" aria-label={t('مراحل الشغل')}>
          {steps.map(({ label, icon: Icon }, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={selected === index}
              aria-controls="overview-guide-content"
              onClick={() => setSelected(index)}
            >
              <span className="overview-guide-index" aria-hidden="true">
                {index + 1}
              </span>
              <Icon size={18} aria-hidden="true" />
              <span>{t(label)}</span>
            </button>
          ))}
        </div>
        <div
          id="overview-guide-content"
          className="overview-guide-content"
          aria-live="polite"
          aria-atomic="true"
        >
          <div key={step.label} className="overview-guide-explanation">
            <h2>{t(step.question)}</h2>
            <p>{t(step.text)}</p>
            <Link href={step.href}>
              {t(step.action)}
              <ArrowUpLeft size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </details>
  );
}
