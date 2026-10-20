'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowUp,
  Cookie,
  FileText,
  Mail,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from '../../../components/ui/brand';
import { LanguageSelect } from '../../../components/language/language-select';
import { ThemeToggle } from '../../../components/theme/theme-toggle';
import { useI18n } from '../../../i18n/language-provider';
import {
  legalContent,
  legalDocumentIds,
  legalOperator,
  type LegalDocumentId,
} from '../content';
import { LegalLinks, legalLinks } from './legal-links';

const icons = { privacy: ShieldCheck, terms: FileText, cookies: Cookie };

export function LegalPage({
  document: documentId,
}: {
  document?: LegalDocumentId;
}) {
  const { t, locale, intlLocale } = useI18n();
  const documents = legalContent[locale];
  const document = documentId ? documents[documentId] : undefined;
  const updated = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: 'long',
  }).format(new Date(`${legalOperator.updated}T12:00:00Z`));
  return (
    <div className="legal-site" id="legal-top">
      <header className="legal-header legal-container">
        <Brand />
        <div className="legal-header-actions">
          <Link href="/" className="legal-home">
            {t('العودة للرئيسية')}
          </Link>
          <LanguageSelect />
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className="legal-container">
        <div className="legal-hero">
          <Link href="/legal" className="legal-eyebrow">
            <span aria-hidden="true" />
            {t('المعلومات القانونية')}
          </Link>
          <h1>{document?.title ?? t('وضوح في الشغل. ووضوح في التفاصيل.')}</h1>
          <p>
            {document?.description ??
              t(
                'اعرف كيف تعمل الخدمة، وكيف نتعامل مع بياناتك وتفضيلاتك. كل التفاصيل هنا، في مكان واحد.',
              )}
          </p>
          <div className="legal-meta">
            <span>
              {t('آخر تحديث')}{' '}
              <time dateTime={legalOperator.updated}>{updated}</time>
            </span>
            {document && (
              <button type="button" onClick={() => window.print()}>
                <Printer size={15} aria-hidden="true" />
                {t('طباعة الصفحة')}
              </button>
            )}
          </div>
          {document && (
            <nav
              className="legal-document-nav"
              aria-label={t('السياسات والوثائق')}
            >
              {legalLinks.map(({ id, label }) => {
                const Icon = icons[id];
                return (
                  <Link
                    key={id}
                    href={`/${id}`}
                    aria-current={id === documentId ? 'page' : undefined}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {t(label)}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        {document ? (
          <div className="legal-reading-layout">
            <aside className="legal-toc">
              <nav aria-labelledby="legal-toc-title">
                <h2 id="legal-toc-title">{t('في هذه الصفحة')}</h2>
                <ol>
                  {document.sections.map((section, index) => (
                    <li key={section.id}>
                      <a href={`#${section.id}`}>
                        <span aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>
            <article className="legal-article" aria-label={document.title}>
              <div className="legal-summary">
                <ShieldCheck size={22} aria-hidden="true" />
                <div>
                  <h2>{t('الفكرة باختصار')}</h2>
                  <p>{document.summary}</p>
                </div>
              </div>
              {document.sections.map((section, index) => (
                <section
                  className="legal-section"
                  id={section.id}
                  key={section.id}
                  aria-labelledby={`${section.id}-title`}
                >
                  <span className="legal-section-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h2 id={`${section.id}-title`}>{section.title}</h2>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets && (
                    <ul>
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {section.table && (
                    <div
                      className="legal-table-wrap"
                      role="group"
                      aria-label={section.title}
                      tabIndex={0}
                    >
                      <table>
                        <caption className="sr-only">{section.title}</caption>
                        <thead>
                          <tr>
                            {section.table.columns.map((column) => (
                              <th scope="col" key={column}>
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.table.rows.map(
                            ([name, purpose, duration]) => (
                              <tr key={name}>
                                <th scope="row">
                                  <bdi>{name}</bdi>
                                </th>
                                <td>{purpose}</td>
                                <td>{duration}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {section.sources && (
                    <div className="legal-sources">
                      <h3>{t('سياسات الخدمات المرتبطة')}</h3>
                      <ul>
                        {section.sources.map(({ label, href }) => (
                          <li key={href}>
                            <a href={href}>
                              {label}
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
              <a className="legal-back-top" href="#legal-top">
                <ArrowUp size={16} aria-hidden="true" />
                {t('العودة لأعلى الصفحة')}
              </a>
            </article>
          </div>
        ) : (
          <div className="legal-card-grid">
            {legalDocumentIds.map((id, index) => {
              const Icon = icons[id];
              return (
                <Link className="legal-document-card" href={`/${id}`} key={id}>
                  <div className="legal-card-top">
                    <span className="legal-card-icon">
                      <Icon size={25} aria-hidden="true" />
                    </span>
                    <span aria-hidden="true">0{index + 1}</span>
                  </div>
                  <h2>{documents[id].title}</h2>
                  <p>{documents[id].description}</p>
                  <span className="legal-card-link">
                    {t('قراءة التفاصيل')}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        <section
          className="legal-contact"
          aria-labelledby="legal-contact-title"
        >
          <div>
            <span className="legal-eyebrow">{t('المسؤول عن Lancelio')}</span>
            <h2 id="legal-contact-title">{t('عمر محمد')}</h2>
            <p>{t('يشغّل Lancelio بصفته فردًا.')}</p>
          </div>
          <div className="legal-contact-details">
            <h3>{t('تواصل بخصوص بياناتك أو الخدمة')}</h3>
            <p>
              {t(
                'راسلنا لطلبات الخصوصية أو الاستفسارات عن الخدمة. لا ترسل كلمات مرور أو مفاتيح سرية.',
              )}
            </p>
            <a href={`mailto:${legalOperator.email}`}>
              <Mail size={17} aria-hidden="true" />
              <span dir="ltr">{legalOperator.email}</span>
            </a>
          </div>
        </section>
        {document && (
          <section
            className="legal-related"
            aria-labelledby="legal-related-title"
          >
            <h2 id="legal-related-title">{t('للقراءة أيضًا')}</h2>
            <div>
              {legalDocumentIds
                .filter((id) => id !== documentId)
                .map((id) => (
                  <Link href={`/${id}`} key={id}>
                    {documents[id].title}
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                ))}
            </div>
          </section>
        )}
      </main>
      <footer className="legal-footer legal-container">
        <LegalLinks />
        <span dir="ltr">© {new Date().getFullYear()} Lancelio.</span>
        <Link href="/">{t('العودة للرئيسية')}</Link>
      </footer>
    </div>
  );
}
