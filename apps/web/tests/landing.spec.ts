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
  await expect(page.locator('.landing-preview-playback')).toHaveCount(0);
  await expect(
    page.locator('.landing-assistant-copy .landing-eyebrow svg'),
  ).toHaveCount(0);
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

test('landing rejects an expired session hint and restores visitor actions', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'lancelio_refresh',
      value: 'expired-session-test',
      url: 'http://localhost:3100',
      httpOnly: true,
    },
  ]);
  await page.route('**/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'UNAUTHENTICATED' },
      }),
    }),
  );
  await page.goto('/');
  await expect(
    page
      .locator('.landing-header')
      .getByRole('link', { name: 'تسجيل الدخول', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.landing-hero').getByRole('link', { name: 'ابدأ مساحتك' }),
  ).toHaveAttribute('href', '/register');
  await expect(page.locator('.landing a[href="/dashboard"]')).toHaveCount(0);
  await expect(page).toHaveURL('/');
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
      const preview = (await page.locator('.landing-preview').boundingBox())!;
      const note = (await page.locator('.landing-payment-note').boundingBox())!;
      expect(note.y).toBeGreaterThan(preview.y + preview.height + 2);
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
      const stamp = (await page
        .locator('.landing-approval-stamp')
        .boundingBox())!;
      const signature = (await page
        .locator('.landing-proposal-signature em')
        .boundingBox())!;
      const paper = (await page
        .locator('.landing-proposal-paper')
        .boundingBox())!;
      expect(
        stamp.x + stamp.width + 6 <= signature.x ||
          signature.x + signature.width + 6 <= stamp.x,
      ).toBe(true);
      expect(stamp.x).toBeGreaterThanOrEqual(paper.x);
      expect(stamp.x + stamp.width).toBeLessThanOrEqual(paper.x + paper.width);
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

for (const locale of ['ar', 'en'] as const) {
  test(`responsive audit: landing opening fits laptop and desktop heights in ${locale}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setLanguage(page, locale);
    for (const [width, height] of [
      [1024, 600],
      [1280, 720],
      [1366, 768],
      [1536, 738],
      [1440, 900],
      [1920, 920],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      for (const selector of [
        '.landing-hero-copy',
        '.landing-preview-controls',
        '.landing-preview',
        '.landing-payment-note',
        '.landing-preview-caption',
        '.landing-flow-strip',
      ]) {
        const bounds = await page.locator(selector).boundingBox();
        expect(bounds, `${selector} at ${width}x${height}`).not.toBeNull();
        expect(
          bounds!.y,
          `${selector} top at ${width}x${height}`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          bounds!.y + bounds!.height,
          `${selector} bottom at ${width}x${height}`,
        ).toBeLessThanOrEqual(height + 1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (width === 1536 || width === 1024) {
        await mkdir('.cache/ui', { recursive: true });
        await page.screenshot({
          path: `.cache/ui/landing-fit-${locale}-${width}-${testInfo.project.name}.png`,
          animations: 'disabled',
        });
      }
    }
  });
}

test('landing preview plays, pauses, resumes and stops for manual exploration and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const preview = page.locator('.landing-visual');
  const selected = page.getByRole('tab', { selected: true });
  await expect(preview).toHaveAttribute('data-playing', 'true');
  await expect(selected).toContainText('المشاريع', { timeout: 9500 });
  await page.getByRole('button', { name: 'إيقاف الحركة' }).click();
  await page.locator('h1').click();
  await expect(page.locator('.landing')).toHaveAttribute(
    'data-motion-paused',
    'true',
  );
  await expect(preview).toHaveAttribute('data-playing', 'false');
  await page.waitForTimeout(6800);
  await expect(selected).toContainText('المشاريع');
  await page.getByRole('button', { name: 'متابعة الحركة' }).click();
  await page.locator('h1').click();
  await expect(page.locator('.landing')).toHaveAttribute(
    'data-motion-paused',
    'false',
  );
  await expect(preview).toHaveAttribute('data-playing', 'true');
  await expect(selected).toContainText('الفواتير', { timeout: 9500 });
  await page.getByRole('tab', { name: 'نظرة عامة', exact: true }).click();
  await page.locator('h1').click();
  await expect(preview).toHaveAttribute('data-playing', 'false');
  await expect(selected).toContainText('نظرة عامة');
  await expect(
    page.getByRole('button', { name: 'متابعة الحركة' }),
  ).toBeEnabled();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    page.getByRole('button', { name: 'متابعة الحركة' }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      preview.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
});

test('responsive audit: landing journey visibly moves, links to features and shares the page motion control', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const flow = page.locator('.landing-flow-strip');
  await expect(flow).toHaveAttribute('data-motion-active', 'true');
  await expect(flow.getByRole('listitem')).toHaveCount(4);
  const dot = flow.locator('.landing-flow-connector > i').first();
  const before = await dot.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await expect
    .poll(
      () => dot.evaluate((element) => getComputedStyle(element).transform),
      { timeout: 4000 },
    )
    .not.toBe(before);
  await mkdir('.cache/ui', { recursive: true });
  await flow.screenshot({
    path: '.cache/ui/landing-animated-flow-ar.png',
  });
  await flow.getByRole('link', { name: /فوّتِر باحتراف/ }).click();
  await expect(page).toHaveURL('/#feature-invoices');
  const invoice = page.locator('#feature-invoices');
  await expect(invoice).toHaveAttribute('data-motion-active', 'true');
  await expect(flow).toHaveAttribute('data-motion-active', 'false');
  expect((await invoice.boundingBox())!.y).toBeGreaterThanOrEqual(
    (await page.locator('.landing-header').boundingBox())!.height,
  );
  const running = () =>
    invoice.evaluate(
      (element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running').length,
    );
  await expect.poll(running).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'إيقاف الحركة' }).click();
  await invoice.scrollIntoViewIfNeeded();
  await expect(page.locator('.landing')).toHaveAttribute(
    'data-motion-paused',
    'true',
  );
  await expect.poll(running).toBe(0);
  await page.getByRole('button', { name: 'متابعة الحركة' }).click();
  await invoice.scrollIntoViewIfNeeded();
  await expect.poll(running).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(running).toBe(0);
});
