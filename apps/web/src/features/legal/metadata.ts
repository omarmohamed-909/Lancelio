import type { Metadata } from 'next';
import { requestLanguage } from '../../i18n/request-locale';
import { translate } from '../../i18n/translate';
import { legalContent, type LegalDocumentId } from './content';

export async function legalMetadata(
  document?: LegalDocumentId,
): Promise<Metadata> {
  const { locale } = await requestLanguage();
  const title = `${document ? legalContent[locale][document].title : translate(locale, 'المعلومات القانونية')} | Lancelio`;
  const description = document
    ? legalContent[locale][document].description
    : translate(
        locale,
        'اعرف كيف تعمل الخدمة، وكيف نتعامل مع بياناتك وتفضيلاتك. كل التفاصيل هنا، في مكان واحد.',
      );
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'ar' ? 'ar_EG' : 'en_US',
    },
  };
}
