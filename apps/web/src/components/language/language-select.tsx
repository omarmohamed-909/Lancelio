'use client';
import { Globe2 } from 'lucide-react';
import { useI18n } from '../../i18n/language-provider';
import { Select } from '../ui/select';

export function LanguageSelect() {
  const { t, locale, changeLanguage } = useI18n();
  const currentLanguage = locale === 'ar' ? 'العربية' : 'English';
  return (
    <Select
      className="language-select"
      title={`${t('لغة الموقع')} · ${currentLanguage}`}
      aria-label={t('لغة الموقع')}
      value={locale}
      onValueChange={(value) => {
        if (value === 'ar' || value === 'en') changeLanguage(value);
      }}
      icon={<Globe2 size={17} aria-hidden="true" />}
    >
      <option value="ar" lang="ar" dir="rtl">
        العربية
      </option>
      <option value="en" lang="en">
        English
      </option>
    </Select>
  );
}
