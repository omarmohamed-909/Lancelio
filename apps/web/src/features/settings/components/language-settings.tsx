'use client';
import { useI18n } from '../../../i18n/language-provider';
import { LanguageSelect } from '../../../components/language/language-select';

export function LanguageSettings() {
  const { t, locale, intlLocale } = useI18n();
  return (
    <section className="profile-sheet" aria-labelledby="language-title">
      <div className="profile-sheet-heading">
        <div>
          <h2 id="language-title">{t('اللغة والمنطقة')}</h2>
          <p>{t('اختار لغة الموقع.')}</p>
        </div>
      </div>
      <LanguageSelect />
      <p className="profile-footnote">
        {t('اختيارك بيتطبّق فورًا وبيتحفظ على المتصفح ده.')}
      </p>
      <dl className="language-preview">
        <div>
          <dt>{t('اللغة الحالية')}</dt>
          <dd>{locale === 'ar' ? 'العربية' : 'English'}</dd>
        </div>
        <div>
          <dt>{t('مثال للأرقام')}</dt>
          <dd>{new Intl.NumberFormat(intlLocale).format(12345)}</dd>
        </div>
      </dl>
    </section>
  );
}
