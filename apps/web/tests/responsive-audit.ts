import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface ResponsiveSeed {
  account: { email: string; password: string };
  clientName: string;
  draftId: string;
  sharedToken: string;
  projectId: string;
}
const viewports = [
  [320, 568],
  [360, 640],
  [375, 812],
  [390, 844],
  [412, 915],
  [430, 932],
  [600, 900],
  [601, 900],
  [760, 900],
  [761, 900],
  [768, 1024],
  [820, 1180],
  [960, 800],
  [961, 800],
  [1024, 768],
  [1100, 900],
  [1101, 900],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [568, 320],
  [844, 390],
  [390, 420],
  [640, 450],
  [320, 256],
] as const;
interface Observation {
  screen: string;
  issues: string[];
}
export async function inspectResponsiveLayout(
  page: Page,
  screen: string,
  touch: boolean,
  viewportWidth: number,
): Promise<Observation> {
  await page.evaluate(() => document.fonts.ready);
  const issues = await page.evaluate(
    ({ touch, viewportWidth }) => {
      const problems: string[] = [];
      const width = Math.min(
        viewportWidth,
        document.documentElement.clientWidth,
      );
      if (document.documentElement.scrollWidth > width + 1)
        problems.push(
          'page horizontal overflow: ' +
            document.documentElement.scrollWidth +
            ' / ' +
            width,
        );
      const sidebar = document.querySelector<HTMLElement>('.workspace-sidebar');
      if (
        sidebar &&
        !sidebar.inert &&
        getComputedStyle(sidebar).visibility === 'visible'
      ) {
        const bounds = sidebar.getBoundingClientRect();
        const footer = sidebar
          .querySelector<HTMLElement>('.sidebar-user')
          ?.getBoundingClientRect();
        if (sidebar.scrollHeight > sidebar.clientHeight + 1)
          problems.push('sidebar vertical overflow');
        if (
          footer &&
          (footer.top < bounds.top || footer.bottom > bounds.bottom + 1)
        )
          problems.push('sidebar account footer outside viewport');
        const workspace =
          sidebar.querySelector<HTMLElement>('.workspace-switch');
        const title = workspace
          ?.querySelector('strong')
          ?.getBoundingClientRect();
        if (
          workspace &&
          title &&
          (title.top < workspace.getBoundingClientRect().top ||
            title.bottom > workspace.getBoundingClientRect().bottom + 1)
        )
          problems.push('sidebar workspace title clipped vertically');
      }
      for (const element of document.querySelectorAll<HTMLElement>(
        'main *, dialog[open] *',
      )) {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        if (
          !box.width ||
          !box.height ||
          style.visibility !== 'visible' ||
          element.closest('[hidden], [inert]')
        )
          continue;
        // Firefox still reports boxes for descendants of a closed details element.
        const closedDetails = element.closest('details:not([open])');
        if (
          closedDetails &&
          closedDetails !== element &&
          !closedDetails.querySelector(':scope > summary')?.contains(element)
        )
          continue;
        const table = element.closest('.proposal-table-wrap');
        // Tables may scroll locally; their host must still fit the page.
        if (table && table !== element) continue;
        if (box.left < -2 || box.right > width + 2)
          problems.push(
            'out of viewport: ' + element.tagName + '.' + element.className,
          );
        // Money and quantities must be readable without scrolling inside an input.
        if (
          element.matches(
            '.proposal-item input[id^="item-price"], .proposal-item input[id^="item-quantity"]',
          )
        ) {
          const input = element as HTMLInputElement;
          const canvas = document.createElement('canvas');
          const metrics = canvas.getContext('2d');
          if (metrics && input.value) {
            metrics.font = style.font;
            // Firefox exposes a native input's inner editor as clientWidth.
            // Use the outer border box consistently and reserve room for number steppers.
            const space =
              box.width -
              parseFloat(style.borderLeftWidth) -
              parseFloat(style.borderRightWidth) -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight) -
              (input.type === 'number' ? 18 : 0);
            if (metrics.measureText(input.value).width > space + 1)
              problems.push(
                'clipped numeric input: ' +
                  input.id +
                  ' measured=' +
                  metrics.measureText(input.value).width +
                  ' available=' +
                  space +
                  ' font=' +
                  style.font +
                  ' grid=' +
                  getComputedStyle(input.closest('.proposal-item')!)
                    .gridTemplateColumns,
              );
          }
        }
        // A native radio's associated label is its full clickable touch target.
        if (element.matches('input[type="radio"]')) {
          const label = (element as HTMLInputElement).labels?.[0];
          const hitArea = label?.getBoundingClientRect() ?? box;
          if (touch && (hitArea.width < 43 || hitArea.height < 43))
            problems.push(
              'small radio touch target: ' + (element as HTMLInputElement).name,
            );
          continue;
        }
        const formControl = element.matches('input, textarea, select');
        if (
          !formControl &&
          element.clientWidth > 0 &&
          style.overflowX === 'visible' &&
          element.scrollWidth > element.clientWidth + 2
        )
          problems.push(
            'internal overflow: ' +
              element.tagName +
              '.' +
              element.className +
              ' ' +
              element.scrollWidth +
              '/' +
              element.clientWidth,
          );
        if (
          touch &&
          element.matches(
            'button, input:not([type="checkbox"]):not([type="hidden"]), select, textarea',
          )
        ) {
          if (box.height < 43 || (element.matches('button') && box.width < 43))
            problems.push(
              'small touch target: ' +
                element.tagName +
                '.' +
                element.className +
                ' ' +
                Math.round(box.width) +
                'x' +
                Math.round(box.height),
            );
          if (formControl && parseFloat(style.fontSize) < 16)
            problems.push(
              'small touch input text: ' +
                element.tagName +
                '.' +
                element.className +
                ' ' +
                style.fontSize,
            );
        }
      }
      return [...new Set(problems)];
    },
    { touch, viewportWidth },
  );
  return { screen, issues };
}
async function preview(
  page: Page,
  testInfo: TestInfo,
  screen: string,
  width: number,
  height: number,
) {
  if (
    ![
      'login',
      'dashboard',
      'clients',
      'client-dialog',
      'proposal-edit',
      'proposal-sharing',
      'project',
      'public-confirmation',
      'public-unavailable',
    ].includes(screen)
  )
    return;
  if (
    ![
      [320, 568],
      [768, 1024],
      [1440, 900],
      [844, 390],
    ].some(([w, h]) => w === width && h === height)
  )
    return;
  const directory = resolve(
    import.meta.dirname,
    '../../../.cache/ui/responsive',
  );
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(
      directory,
      testInfo.project.name +
        '-' +
        width +
        'x' +
        height +
        '-' +
        screen +
        '.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
}
export function defineResponsiveTests(seed: () => Promise<ResponsiveSeed>) {
  test.describe('responsive audit', () => {
    for (const [width, height] of viewports) {
      test(
        width +
          'x' +
          height +
          ' forms, workspace, dialogs, agreements and project',
        async ({ browser, browserName }, testInfo) => {
          test.setTimeout(120_000);
          const data = await seed();
          const touch = width <= 1100 && width !== 961;
          const context = await browser.newContext({
            viewport: { width, height },
            hasTouch: touch,
            deviceScaleFactor: touch ? 2 : 1,
            isMobile: browserName !== 'firefox' && width <= 430,
            reducedMotion: 'reduce',
            baseURL: 'http://localhost:3100',
          });
          const page = await context.newPage();
          page.setDefaultTimeout(15_000);
          const observations: Observation[] = [];
          async function audit(screen: string) {
            observations.push(
              await inspectResponsiveLayout(page, screen, touch, width),
            );
            await writeFile(
              testInfo.outputPath('responsive.json'),
              JSON.stringify(
                {
                  engine: browserName,
                  viewport: { width, height },
                  touch,
                  observations,
                },
                null,
                2,
              ),
            );
            await preview(page, testInfo, screen, width, height);
          }
          try {
            await page.goto('/register');
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            await audit('register');
            await page
              .getByRole('button', { name: 'إنشاء حسابي', exact: true })
              .click();
            await expect(page.locator('.field-error').first()).toBeVisible();
            await audit('register-validation');
            await page.goto('/login');
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            await page.getByLabel('البريد الإلكتروني').fill(data.account.email);
            await page
              .getByLabel('كلمة المرور', { exact: true })
              .fill(data.account.password);
            await page
              .getByRole('button', { name: 'إظهار كلمة المرور' })
              .click();
            await audit('login');
            await page
              .getByRole('button', { name: 'دخول لمساحتك', exact: true })
              .click();
            await expect(page).toHaveURL('/dashboard');
            await expect(page.locator('.account-panel')).toBeVisible();
            await audit('dashboard');
            if (width <= 760) {
              await page
                .getByRole('button', { name: 'فتح القائمة', exact: true })
                .click();
              const menu = page.getByRole('dialog', {
                name: 'قائمة مساحة العمل',
                exact: true,
              });
              await expect(menu).toBeVisible();
              const close = menu.getByRole('button', {
                name: 'إغلاق القائمة',
                exact: true,
              });
              await expect(close).toBeFocused();
              await menu
                .getByRole('button', { name: 'تسجيل الخروج', exact: true })
                .click({ trial: true });
              await page.keyboard.press('Escape');
              await expect(
                page.getByRole('button', { name: 'فتح القائمة', exact: true }),
              ).toBeFocused();
            } else {
              await page
                .locator('.sidebar-user')
                .getByRole('button', { name: 'تسجيل الخروج', exact: true })
                .click({ trial: true });
            }
            await page.goto('/clients');
            await expect(page.locator('.client-row').first()).toBeVisible();
            await audit('clients');
            await page
              .getByRole('button', { name: 'عميل جديد', exact: true })
              .click();
            const dialog = page.getByRole('dialog');
            await expect(dialog).toBeVisible();
            await audit('client-dialog');
            await dialog
              .getByRole('button', { name: 'إضافة العميل', exact: true })
              .click();
            await expect(dialog.locator('.field-error')).toBeVisible();
            await audit('client-validation');
            await dialog
              .getByRole('button', { name: 'إغلاق النافذة', exact: true })
              .click();
            await page
              .locator('.client-row')
              .first()
              .getByRole('button', {
                name: 'أرشفة ' + data.clientName,
                exact: true,
              })
              .click();
            await expect(dialog).toBeVisible();
            await audit('archive-dialog');
            await dialog
              .getByRole('button', { name: 'إغلاق النافذة', exact: true })
              .click();
            await page
              .locator('.client-search-input input')
              .fill('no-client-matches-this-search');
            await expect(page.locator('.client-empty')).toBeVisible();
            await audit('clients-empty');
            await page.goto('/proposals');
            await expect(page.locator('.proposal-row').first()).toBeVisible();
            await audit('proposals');
            await page.goto('/proposals/new');
            await expect(
              page.getByLabel('عنوان العرض', { exact: true }),
            ).toBeVisible();
            await expect(
              page.locator('.proposal-client-options button').first(),
            ).toBeVisible();
            await audit('proposal-new');
            await page
              .locator('.proposal-client-options button')
              .first()
              .click();
            await page
              .getByRole('button', { name: 'إضافة بند', exact: true })
              .click();
            await page
              .getByRole('button', { name: 'حفظ المسودة', exact: true })
              .click();
            await expect(page.locator('.field-error').first()).toBeVisible();
            await audit('proposal-validation');
            // This form contains only test input; explicitly acknowledge its dirty-navigation prompt.
            page.on('dialog', (dialog) => dialog.accept());
            await page.goto('/proposals/' + data.draftId + '/edit');
            await expect(
              page.getByLabel('عنوان العرض', { exact: true }),
            ).not.toHaveValue('');
            await audit('proposal-edit');
            await page.goto('/proposals/' + data.draftId);
            await expect(page.getByRole('table')).toBeVisible();
            await audit('proposal-review');
            const tableRegion = page.locator('.proposal-table-wrap');
            if (
              await tableRegion.evaluate(
                (element) => element.scrollWidth > element.clientWidth + 1,
              )
            ) {
              await expect(tableRegion).toHaveAttribute('tabindex', '0');
              await tableRegion.focus();
              await page.keyboard.press('ArrowLeft');
              await expect
                .poll(() =>
                  tableRegion.evaluate((element) =>
                    Math.abs(element.scrollLeft),
                  ),
                )
                .toBeGreaterThan(0);
              await tableRegion.evaluate((element) => {
                element.scrollLeft = 0;
              });
            }
            await page
              .getByLabel('راجعت العرض وجاهز للمشاركة.', { exact: false })
              .check();
            await page
              .getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true })
              .click();
            await expect(
              page.getByLabel('رابط العميل', { exact: true }),
            ).toBeVisible();
            await audit('proposal-sharing');
            await page.goto('/projects/' + data.projectId);
            await expect(page.getByRole('table')).toBeVisible();
            await audit('project');
            await page.goto('/share/proposal#' + data.sharedToken);
            await expect(
              page.getByRole('button', { name: 'قبول العرض', exact: true }),
            ).toBeVisible();
            await audit('public-proposal');
            await page
              .getByRole('button', { name: 'قبول العرض', exact: true })
              .click();
            await expect(
              page.getByRole('button', {
                name: 'تأكيد قبول العرض',
                exact: true,
              }),
            ).toBeFocused();
            await audit('public-confirmation');
            await page
              .getByRole('button', { name: 'تأكيد قبول العرض', exact: true })
              .click();
            await expect(
              page.getByRole('heading', { name: 'تم قبول العرض', exact: true }),
            ).toBeVisible();
            await audit('public-complete');
            await page.goto('/share/proposal#' + 'x'.repeat(43));
            await expect(
              page.getByRole('heading', {
                name: 'الرابط غير متاح',
                exact: true,
              }),
            ).toBeVisible();
            await audit('public-unavailable');
            await page.route('**/auth/refresh', (route) =>
              route.abort('failed'),
            );
            await page.goto('/dashboard');
            await expect(
              page.getByRole('heading', {
                name: 'مش قادرين نفتح مساحتك حاليًا.',
                exact: true,
              }),
            ).toBeVisible();
            await audit('session-unavailable');
            await writeFile(
              testInfo.outputPath('responsive.json'),
              JSON.stringify(
                {
                  engine: browserName,
                  viewport: { width, height },
                  touch,
                  mobileEmulation: browserName !== 'firefox' && width <= 430,
                  observations,
                },
                null,
                2,
              ),
            );
            expect(
              observations.flatMap((row) =>
                row.issues.map((issue) => row.screen + ': ' + issue),
              ),
            ).toEqual([]);
          } finally {
            await context.close();
          }
        },
      );
    }
    test('live orientation, keyboard-height reflow and reachable navigation', async ({
      browser,
    }, testInfo) => {
      test.setTimeout(90_000);
      const data = await seed();
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        reducedMotion: 'reduce',
        baseURL: 'http://localhost:3100',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      try {
        await page.goto('/login');
        await page.getByLabel('البريد الإلكتروني').fill(data.account.email);
        await page
          .getByLabel('كلمة المرور', { exact: true })
          .fill(data.account.password);
        await page
          .getByRole('button', { name: 'دخول لمساحتك', exact: true })
          .click();
        await expect(page).toHaveURL('/dashboard');
        const trigger = page.getByRole('button', {
          name: 'فتح القائمة',
          exact: true,
        });
        await trigger.click();
        await expect(
          page.getByRole('dialog', { name: 'قائمة مساحة العمل' }),
        ).toBeVisible();
        await page.setViewportSize({ width: 844, height: 390 });
        await expect(
          page.getByRole('dialog', { name: 'قائمة مساحة العمل' }),
        ).toHaveCount(0);
        await expect(page.getByRole('main')).not.toHaveAttribute('inert', '');
        expect(
          await page.evaluate(() => document.body.style.overflow),
        ).not.toBe('hidden');
        await page
          .locator('.sidebar-user')
          .getByRole('button', { name: 'تسجيل الخروج', exact: true })
          .click({ trial: true });
        await page.setViewportSize({ width: 390, height: 420 });
        await trigger.click();
        await page
          .getByRole('navigation', { name: 'التنقل الرئيسي' })
          .getByRole('link', { name: 'العملاء', exact: true })
          .click();
        await expect(page).toHaveURL('/clients');
        await page
          .getByRole('button', { name: 'عميل جديد', exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await dialog
          .locator('textarea')
          .fill('ملاحظة محفوظة أثناء تغيير الاتجاه.');
        await page.setViewportSize({ width: 844, height: 390 });
        await expect(dialog.locator('textarea')).toHaveValue(
          'ملاحظة محفوظة أثناء تغيير الاتجاه.',
        );
        expect(
          (await inspectResponsiveLayout(page, 'rotated-dialog', true, 844))
            .issues,
        ).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'عميل جديد', exact: true }),
        ).toBeFocused();
        await page.setViewportSize({ width: 320, height: 256 });
        await trigger.click();
        const menu = page.getByRole('dialog', { name: 'قائمة مساحة العمل' });
        await menu
          .getByRole('button', { name: 'تسجيل الخروج', exact: true })
          .click({ trial: true });
        const firstControl = menu.locator('a[href]').first();
        await firstControl.focus();
        await page.keyboard.press('Shift+Tab');
        await expect(
          menu.getByRole('button', { name: 'تسجيل الخروج', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(firstControl).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        expect(
          (await inspectResponsiveLayout(page, 'short-viewport', true, 320))
            .issues,
        ).toEqual([]);
        await testInfo.attach('orientation-check', {
          body: 'Portrait → landscape → short viewport; dialog text and navigation remain usable.',
          contentType: 'text/plain',
        });
      } finally {
        await context.close();
      }
    });
  });
}
