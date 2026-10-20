import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const documents = [
  { path: '/privacy', ar: 'سياسة الخصوصية', en: 'Privacy policy', sections: 8 },
  { path: '/terms', ar: 'شروط الاستخدام', en: 'Terms of use', sections: 8 },
  {
    path: '/cookies',
    ar: 'ملفات الارتباط والتفضيلات',
    en: 'Cookies and preferences',
    sections: 4,
  },
] as const;

for (const locale of ['ar', 'en'] as const) {
  test(`legal pages are public and translated without a session dependency: ${locale}`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'lancelio_language',
        value: locale,
        url: 'http://localhost:3100',
      },
      {
        name: 'lancelio_refresh',
        value: 'expired-hint',
        url: 'http://localhost:3100',
        httpOnly: true,
      },
    ]);
    const calls: string[] = [];
    await page.route('**/api/v1/**', (route) => {
      calls.push(route.request().url());
      return route.abort();
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/legal');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      locale === 'ar'
        ? 'وضوح في الشغل. ووضوح في التفاصيل.'
        : 'Clear work. Clear terms.',
    );
    await expect(page.locator('.legal-document-card')).toHaveCount(3);
    await expect(page.locator('.legal-contact a')).toHaveAttribute(
      'href',
      'mailto:omar.m.ombark@gmail.com',
    );
    for (const document of documents) {
      const response = await page.goto(document.path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(document.path);
      await expect(page).toHaveTitle(`${document[locale]} | Lancelio`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        document[locale],
      );
      await expect(page.locator('.legal-section')).toHaveCount(
        document.sections,
      );
      await expect(
        page.locator('.legal-document-nav [aria-current="page"]'),
      ).toHaveAttribute('href', document.path);
      await page.locator('.legal-toc a').last().click();
      await expect(page.locator('.legal-section').last()).toBeInViewport();
      await page.locator('.legal-back-top').click();
      await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    }
    await expect(page.getByRole('table')).toHaveCount(2);
    expect(calls).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('legal footer links work from landing and authentication and preserve language', async ({
  page,
}) => {
  for (const route of ['/', '/login', '/register']) {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(route);
    const footer = page.locator(
      route === '/' ? '.landing-footer' : '.auth-footer',
    );
    for (const document of documents) {
      await expect(
        footer.getByRole('link', { name: document.ar, exact: true }),
      ).toHaveAttribute('href', document.path);
    }
    await expect(footer.locator('.legal-links')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page
    .locator('.auth-footer')
    .getByRole('link', { name: 'سياسة الخصوصية', exact: true })
    .click();
  await expect(page).toHaveURL('/privacy');
  await page.getByRole('combobox', { name: 'لغة الموقع' }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Privacy policy',
  );
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page).toHaveTitle('Privacy policy | Lancelio');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Privacy policy',
  );
  await page
    .locator('.legal-document-nav')
    .getByRole('link', { name: 'Terms of use' })
    .click();
  await expect(page).toHaveURL('/terms');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Terms of use',
  );
  await page
    .locator('.legal-footer')
    .getByRole('link', { name: 'Back to home' })
    .click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.landing-footer .legal-links')).toContainText(
    'Privacy policy',
  );
});

for (const { locale, theme } of [
  { locale: 'ar', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`legal responsive audit: ${locale} ${theme} documents, cookies and keyboard navigation`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(120_000);
    await context.addCookies([
      {
        name: 'lancelio_language',
        value: locale,
        url: 'http://localhost:3100',
      },
    ]);
    await page.addInitScript(
      (value) => localStorage.setItem('lancelio:theme:v1', value),
      theme,
    );
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/legal', '/cookies', '/privacy']) {
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await expect(page.locator('.legal-header .brand')).toBeInViewport();
        if (width === 390 || width === 1440) {
          const audit = await new AxeBuilder({ page }).analyze();
          expect(audit.violations).toEqual([]);
        }
        if (width === 390 || width === 1440) {
          await mkdir('.cache/ui', { recursive: true });
          await page.screenshot({
            path: `.cache/ui/legal-${route.slice(1)}-${locale}-${theme}-${width}-${info.project.name}.png`,
            fullPage: true,
          });
        }
      }
    }
    await page.goto('/cookies');
    await page.locator('.legal-toc a').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#cookies')).toBeInViewport();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.legal-header')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.legal-contact')).toBeVisible();
  });
}
