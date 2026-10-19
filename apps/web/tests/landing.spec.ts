import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';

async function setLanguage(page: Page, locale: 'ar' | 'en') {
  await page.context().addCookies([
    {
      name: 'lancelio_language',
      value: locale,
      url: 'http://localhost:3100',
    },
  ]);
}

test('landing is public without an API dependency and links into the real authentication flow', async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route('**/api/v1/**', (route) => {
    calls.push(route.request().url());
    return route.abort();
  });
  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'شغلك طموح.',
  );
  await expect(page).toHaveTitle('Lancelio | شغلك كله، في مكانه');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(
    page.locator('.landing-hero').getByRole('link', { name: 'ابدأ مساحتك' }),
  ).toHaveAttribute('href', '/register');
  await expect(
    page
      .locator('.landing-header')
      .getByRole('link', { name: 'تسجيل الدخول', exact: true }),
  ).toHaveAttribute('href', '/login');
  await expect(page.getByRole('tab', { selected: true })).toContainText(
    'نظرة عامة',
  );
  const previewHeight = (await page.locator('.landing-preview').boundingBox())!
    .height;
  await page.getByRole('tab', { name: 'المشاريع', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('تصميم متجر مدار');
  await page.getByRole('tab', { name: 'المشاريع', exact: true }).press('End');
  await expect(
    page.getByRole('tab', { name: 'الفواتير', exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('فاتورة هوية نواة');
  expect(
    (await page.locator('.landing-preview').boundingBox())!.height,
  ).toBeCloseTo(previewHeight, 0);
  await page.getByRole('tab', { name: 'الفواتير', exact: true }).press('Home');
  await expect(
    page.getByRole('tab', { name: 'نظرة عامة', exact: true }),
  ).toBeFocused();
  await page.getByText('العميل محتاج يعمل حساب؟', { exact: true }).click();
  await expect(page.locator('details[open]')).toContainText('من غير حساب');
  expect(calls).toEqual([]);
  await page
    .locator('.landing-header')
    .getByRole('link', { name: 'تسجيل الدخول', exact: true })
    .click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('landing chooses English from device preferences and keeps an explicit language selection', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Big ideas.',
    );
    await expect(page).toHaveTitle('Lancelio | A clearer way to work');
    await page.getByRole('combobox', { name: 'Site language' }).click();
    await page.getByRole('option', { name: 'العربية', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'شغلك طموح.',
    );
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  } finally {
    await context.close();
  }
});

test('landing mobile navigation supports anchors and Escape without blocking the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'افتح القائمة' });
  await toggle.click();
  await expect(page.locator('#landing-mobile-navigation')).toBeVisible();
  await page
    .locator('#landing-mobile-navigation')
    .getByRole('link', { name: 'ليه Lancelio؟' })
    .click();
  await expect(page).toHaveURL('/#features');
  await expect(page.locator('#landing-mobile-navigation')).toBeHidden();
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.locator('#landing-mobile-navigation')).toBeHidden();
  await toggle.click();
  await page
    .locator('#landing-mobile-navigation')
    .getByRole('link', { name: 'رحلة الشغل' })
    .focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.locator('#landing-mobile-navigation')).toBeHidden();
});

for (const locale of ['ar', 'en'] as const) {
  for (const width of [320, 390, 768, 1440]) {
    test(`responsive audit: landing ${locale} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setLanguage(page, locale);
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await page
        .getByRole('tab', {
          name: locale === 'ar' ? 'الفواتير' : 'Invoices',
          exact: true,
        })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await page
        .getByRole('tab', {
          name: locale === 'ar' ? 'نظرة عامة' : 'Overview',
          exact: true,
        })
        .click();
      if (width === 390 || width === 1440) {
        await mkdir('.cache/ui', { recursive: true });
        await page.screenshot({
          path: `.cache/ui/landing-${locale}-${width}-${testInfo.project.name}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        await page.screenshot({
          path: `.cache/ui/landing-${locale}-${width}-${testInfo.project.name}-viewport.png`,
          animations: 'disabled',
        });
      }
      if (width === 390 || width === 1440) {
        const scan = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(scan.violations).toEqual([]);
      }
    });
  }
}

test('responsive audit: landing dark appearance stays accessible and respects reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('.landing-desktop-theme').getByRole('button').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  expect(
    await page
      .locator('.landing')
      .evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length,
      ),
  ).toBe(0);
  await mkdir('.cache/ui', { recursive: true });
  await page.screenshot({
    path: '.cache/ui/landing-ar-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
});
