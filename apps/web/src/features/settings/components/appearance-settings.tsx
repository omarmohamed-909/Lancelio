'use client';
import { useI18n } from '../../../i18n/language-provider';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../../components/theme/theme-provider';

const choices = [
  {
    value: 'light',
    label: 'فاتح',
    description: 'ورق فاتح وتفاصيل خضراء.',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'داكن',
    description: 'درجات داكنة وإضاءة أهدى.',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'حسب الجهاز',
    description: 'يتغيّر تلقائيًا مع مظهر جهازك.',
    icon: Monitor,
  },
] as const;

export function AppearanceSettings() {
  const { t } = useI18n();
  const { preference, setTheme } = useTheme();
  return (
    <section
      className="profile-sheet appearance-settings"
      aria-labelledby="appearance-title"
    >
      <div className="profile-sheet-heading">
        <div>
          <h2 id="appearance-title">{t('مظهر الموقع')}</h2>
          <p>{t('اختار الإضاءة اللي تريحك.')}</p>
        </div>
      </div>
      <fieldset>
        <legend className="sr-only">{t('مظهر الموقع')}</legend>
        <div className="theme-choices">
          {choices.map(({ value, label, description, icon: Icon }) => (
            <label className="theme-choice" key={value}>
              <input
                type="radio"
                name="appearance"
                value={value}
                checked={preference === value}
                onChange={() => setTheme(value)}
              />
              <Icon size={23} aria-hidden="true" />
              <span>
                <strong>{t(label)}</strong>
                <small>{t(description)}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="profile-footnote">
        {t(
          'اختيارك بيتطبّق فورًا وبيتحفظ على المتصفح ده. تقدر تبدّل بسرعة من زر المظهر أعلى الصفحة.',
        )}{' '}
      </p>
    </section>
  );
}
