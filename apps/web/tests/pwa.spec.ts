import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';

async function ready(page: Page) {
  await expect(page.locator('[data-worker-status]')).toHaveAttribute(
    'data-worker-status',
    'ready',
  );
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

test('PWA manifest, opaque icons, metadata and worker headers meet installation requirements', async ({
  page,
  request,
  browserName,
}) => {
  await page.goto('/install');
  await ready(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect(
    page.locator('meta[name="mobile-web-app-capable"]'),
  ).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#173d30',
  );
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: '/',
    scope: '/',
    start_url: '/dashboard',
    display: 'standalone',
    prefer_related_applications: false,
  });
  expect(manifest.icons).toHaveLength(3);
  for (const icon of manifest.icons) {
    const asset = await request.get(icon.src);
    expect(asset.status()).toBe(200);
    const metadata = await sharp(await asset.body()).metadata();
    expect(`${metadata.width}x${metadata.height}`).toBe(icon.sizes);
    expect(metadata.hasAlpha).toBe(false);
  }
  const worker = await request.get('/sw.js');
  expect(worker.headers()['content-type']).toContain('javascript');
  expect(worker.headers()['cache-control']).toContain('no-store');
  expect(worker.headers()['service-worker-allowed']).toBe('/');
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    const manifestCheck = await cdp.send('Page.getAppManifest');
    expect(manifestCheck.errors).toEqual([]);
    const installability = await cdp.send('Page.getInstallabilityErrors');
    expect(installability.installabilityErrors).toEqual([]);
    await cdp.detach();
  }
});

test('native installation waits for a click and handles dismissed, failed, accepted and installed states honestly', async ({
  page,
}) => {
  await page.goto('/install');
  await ready(page);
  for (const outcome of ['dismissed', 'failed', 'accepted'] as const) {
    await page.evaluate((value) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      document.documentElement.dataset.promptCalls = '0';
      Object.defineProperties(event, {
        prompt: {
          value: async () => {
            document.documentElement.dataset.promptCalls = String(
              Number(document.documentElement.dataset.promptCalls) + 1,
            );
            if (value === 'failed')
              throw new Error('Browser declined the prompt');
          },
        },
        userChoice: { value: Promise.resolve({ outcome: value }) },
      });
      window.dispatchEvent(event);
    }, outcome);
    await expect(
      page.getByRole('button', { name: 'ثبّت على جهازك' }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-prompt-calls',
      '0',
    );
    await page.evaluate(() => {
      const button =
        document.querySelector<HTMLButtonElement>('.install-primary')!;
      button.click();
      button.click();
    });
    await expect(page.locator('html')).toHaveAttribute(
      'data-prompt-calls',
      '1',
    );
    await expect(
      page.getByRole('heading', { name: 'التطبيق مثبت على جهازك.' }),
    ).toHaveCount(0);
    await expect(
      page.locator('.install-app-card .install-status'),
    ).toContainText(
      outcome === 'accepted'
        ? 'تم إرسال طلب التثبيت'
        : outcome === 'dismissed'
          ? 'في أي وقت'
          : 'تعذّر فتح',
    );
  }
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(
    page.getByRole('heading', { name: 'التطبيق مثبت على جهازك.' }),
  ).toBeVisible();
  await expect(page.locator('.install-primary')).toHaveCount(0);
});

for (const locale of ['ar', 'en'] as const) {
  test(`offline fallback is localized and never stores or replays private data: ${locale}`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'lancelio_language',
        value: locale,
        url: 'http://localhost:3200',
      },
    ]);
    await page.addInitScript(
      (value) => localStorage.setItem('lancelio:theme:v1', value),
      locale === 'ar' ? 'light' : 'dark',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/install');
    await ready(page);
    await page.goto('/privacy');
    await page.evaluate(async () => {
      await fetch('/api/v1/pwa-private-probe', {
        headers: { Authorization: 'Bearer synthetic-test-value' },
      });
    });
    const cached = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((name) =>
        name.startsWith('lancelio-offline-'),
      );
      const keys = await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (item) => new URL(item.url).pathname,
          ),
        ),
      );
      return keys.flat().sort();
    });
    expect(cached).toEqual([
      '/offline',
      '/pwa/icon-192.png',
      '/pwa/icon-512.png',
      '/pwa/maskable-512.png',
    ]);
    let writes = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/pwa-private-probe')
      )
        writes++;
    });
    await context.setOffline(true);
    expect(
      await page.evaluate(async () => {
        try {
          await fetch('/api/v1/pwa-private-probe', {
            method: 'POST',
            body: 'synthetic-unsent-write',
          });
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    expect(
      await page.evaluate(async () => {
        try {
          await fetch('/privacy?_rsc=pwa-probe', { headers: { RSC: '1' } });
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    const writesBeforeReconnection = writes;
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      locale === 'ar' ? 'light' : 'dark',
    );
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      locale === 'ar' ? 'شغلك مستنيك' : 'Your work is here',
    );
    await expect(
      page.locator('.workspace-shell, .assistant-launcher'),
    ).toHaveCount(0);
    // Recover a public URL without needing the separate authentication test API.
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      locale === 'ar' ? 'شغلك مستنيك' : 'Your work is here',
    );
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
      path: `.cache/ui/pwa-offline-${locale}-${test.info().project.name}.png`,
    });
    await context.setOffline(false);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      locale === 'ar' ? 'شغلك مستنيك' : 'Your work is here',
    );
    await page
      .getByRole('button', {
        name: locale === 'ar' ? 'حاول مرة تانية' : 'Try again',
      })
      .click();
    await expect(page).toHaveURL('/privacy');
    await expect(page.locator('.legal-article')).toBeVisible();
    expect(writes).toBe(writesBeforeReconnection);
  });
}

test('worker update waits for existing windows and preserves the current document', async ({
  page,
  context,
}) => {
  await page.goto('/install');
  await ready(page);
  await page.evaluate(async () => {
    const input = document.createElement('input');
    input.id = 'unsaved-update-probe';
    input.value = 'unsaved-work';
    document.body.append(input);
    await caches.open('unrelated-application-cache');
    await caches.open('lancelio-offline-obsolete');
    await navigator.serviceWorker.register('/sw.js?update-probe=1', {
      scope: '/',
      updateViaCache: 'none',
    });
  });
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration('/'))?.waiting),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'التحقق من تحديث التطبيق' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'تحديث جاهز' }),
  ).toBeVisible();
  await expect(page.locator('#unsaved-update-probe')).toHaveValue(
    'unsaved-work',
  );
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.controller?.scriptURL.includes('update-probe'),
    ),
  ).toBe(false);
  await page.close();
  const next = await context.newPage();
  await next.goto('/install');
  await ready(next);
  const names = await next.evaluate(() => caches.keys());
  expect(names).toContain('unrelated-application-cache');
  expect(names).not.toContain('lancelio-offline-obsolete');
});

test('worker installation failure leaves the site usable and reports incomplete offline setup', async ({
  page,
  context,
}) => {
  await context.route('**/sw.js', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/install');
  await expect(page.locator('[data-worker-status]')).toHaveAttribute(
    'data-worker-status',
    'failed',
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'التحقق من تحديث التطبيق' }),
  ).toBeDisabled();
});

test('install guide stays public, responsive and accessible in both languages', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const apiCalls: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) apiCalls.push(request.url());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'lancelio:theme:v1',
      /(?:^|;\s*)lancelio_language=en(?:;|$)/u.test(document.cookie)
        ? 'dark'
        : 'light',
    ),
  );
  for (const locale of ['ar', 'en'] as const) {
    await context.addCookies([
      {
        name: 'lancelio_language',
        value: locale,
        url: 'http://localhost:3200',
      },
    ]);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/install');
      await ready(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        locale === 'ar' ? 'خد Lancelio معاك.' : 'Keep Lancelio close.',
      );
      await page
        .getByRole('button', {
          name: locale === 'ar' ? 'iPhone وiPad' : 'iPhone & iPad',
        })
        .click();
      await expect(page.locator('[data-device="ios"]')).toContainText('Safari');
      if (width === 390 || width === 1440) {
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
        });
        await page.screenshot({
          path: `.cache/ui/pwa-install-${locale}-${width}-${test.info().project.name}.png`,
          fullPage: true,
        });
      }
    }
  }
  expect(errors).toEqual([]);
  expect(apiCalls).toEqual([]);
});
