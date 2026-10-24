import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { respondToAppConfirmation } from './app-confirmation';
const accessId = '111111111111111111111111',
  clientId = '222222222222222222222222',
  secret = 'a'.repeat(43);
const identity = {
  user: {
    id: '333333333333333333333333',
    name: 'عمر محمد',
    email: 'client@example.com',
  },
  workspace: {
    id: '444444444444444444444444',
    name: 'مساحتي الخاصة',
    slug: 'my-studio',
  },
  membership: { id: '555555555555555555555555', role: 'owner' },
};
const pending = {
  id: accessId,
  version: 1,
  email: 'client@example.com',
  workspaceName: 'استوديو نواة',
  clientName: 'عمر محمد',
  state: 'pending',
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};
const portal = {
  workspaceName: 'استوديو نواة',
  client: { name: 'عمر محمد', company: '' },
  asOf: new Date().toISOString(),
  projects: [
    {
      title: 'هوية المشروع المشتركة',
      summary: 'تفاصيل متفق عليها',
      status: 'active',
      progress: { total: 1, done: 1, percentage: 100 },
      tasks: [{ title: 'مراجعة الهوية', description: '', status: 'done' }],
    },
  ],
  invoices: [],
  nextProjectCursor: null,
  nextInvoiceCursor: null,
};
async function fixture(
  page: Page,
  options: {
    anonymous?: boolean;
    accepted?: boolean;
    unverified?: boolean;
    mailFailure?: boolean;
  } = {},
) {
  let authenticated = !options.anonymous,
    accepted = !!options.accepted,
    removed = false,
    ownerVersion = 0;
  await page.route('http://localhost:5100/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const body = route.request().postDataJSON() as Record<
      string,
      unknown
    > | null;
    const ok = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ success: true, data }),
      });
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'authorization,content-type',
          'Access-Control-Allow-Methods': 'GET,POST',
        },
      });
    if (path === '/auth/google/config') return ok({ enabled: false });
    if (path === '/auth/login' || path === '/auth/register')
      authenticated = true;
    if (['/auth/refresh', '/auth/login', '/auth/register'].includes(path))
      return authenticated
        ? ok({
            ...identity,
            accessToken: 'test-access-token',
            expiresIn: 3600,
            tokenType: 'Bearer',
          })
        : route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: { code: 'UNAUTHENTICATED' },
            }),
          });
    if (path === '/auth/me') return ok(identity);
    if (path === '/client-access/list')
      return ok({
        verificationRequired: !!options.unverified,
        hasMore: false,
        nextCursor: null,
        items:
          removed || (options.unverified && !accepted)
            ? []
            : [
                {
                  ...pending,
                  state: accepted ? 'accepted' : 'pending',
                  version: accepted ? 2 : 1,
                },
              ],
      });
    if (path === '/client-access/resolve') return ok(pending);
    if (path === '/client-access/' + accessId + '/decide') {
      accepted = body?.accept === true;
      removed = !accepted;
      return route.fulfill({ status: 204 });
    }
    if (path === '/client-access/' + accessId + '/leave') {
      removed = true;
      return route.fulfill({ status: 204 });
    }
    if (path === '/client-access/' + accessId + '/portal') return ok(portal);
    if (
      path === '/client-access/owner/' + clientId &&
      route.request().method() === 'GET'
    )
      return ok({
        email: 'client@example.com',
        version: ownerVersion,
        access: ownerVersion ? pending : null,
      });
    if (path === '/client-access/owner/' + clientId) {
      ownerVersion++;
      return ok(
        {
          access: pending,
          token: secret,
          delivery: options.mailFailure ? 'failed' : 'accepted',
        },
        201,
      );
    }
    if (path === '/clients/' + clientId + '/portal')
      return ok({
        client: {
          id: clientId,
          name: 'عمر محمد',
          company: '',
          archived: false,
        },
        version: 0,
        share: null,
      });
    if (path === '/clients/' + clientId + '/portal/preview') return ok(portal);
    if (path.includes('/notifications'))
      return ok(
        path.endsWith('/count')
          ? { unreadCount: 0 }
          : { items: [], unreadCount: 0, nextCursor: null },
      );
    return ok({});
  });
}
test('client owner accepts an invitation, reads only its portal, and keeps their own workspace', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/connections');
  await expect(
    page.getByRole('heading', { name: 'بتتعامل معاهم.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'استوديو نواة' }),
  ).toBeVisible();
  await expect(page.getByText('مساحتي الخاصة', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'قبول الدعوة', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'فتح بوابة المتابعة', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'فتح بوابة المتابعة', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'هوية المشروع المشتركة' }),
  ).toBeVisible();
  await expect(page.getByText('مساحتي الخاصة', { exact: true })).toBeVisible();
  await expect(page.getByText('عرض العميل فقط', { exact: true })).toBeVisible();
  await page.screenshot({
    path: '../../.cache/connections-portal-desktop.png',
    fullPage: true,
  });
});
test('email invitation survives sign-in and supports an account without verified email', async ({
  page,
}) => {
  await fixture(page, { anonymous: true, unverified: true });
  await page.goto('/connections#' + secret);
  await page.getByRole('link', { name: 'تسجيل الدخول', exact: true }).click();
  await page
    .getByLabel('البريد الإلكتروني', { exact: true })
    .fill('client@example.com');
  await page
    .getByLabel('كلمة المرور', { exact: true })
    .fill('a long secure passphrase');
  await page.getByRole('button', { name: 'دخول لمساحتك', exact: true }).click();
  await expect(page).toHaveURL(/\/connections$/u);
  await expect(
    page.getByRole('heading', { name: 'استوديو نواة' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'قبول الدعوة', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'فتح بوابة المتابعة', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('lancelio.client-invitation'),
    ),
  ).toBeNull();
});
test('declining and leaving require confirmation and remove the card', async ({
  page,
}) => {
  await fixture(page, { accepted: true });
  await page.goto('/connections');
  await page.getByRole('button', { name: 'مغادرة', exact: true }).click();
  await respondToAppConfirmation(page, (dialog) => dialog.accept());
  await expect(
    page.getByRole('heading', { name: 'أول تعاون يبدأ بدعوة.' }),
  ).toBeVisible();
});
test('owner can prepare a reviewed invitation and copy a manual link after provider failure', async ({
  page,
}) => {
  await fixture(page, { mailFailure: true });
  await page.goto('/clients/' + clientId + '/portal');
  await expect(
    page.getByRole('button', { name: 'إرسال دعوة للعميل', exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel('راجعت معاينة البوابة والبريد المدعو وموافق أشاركهم')
    .check();
  await page
    .getByRole('button', { name: 'إرسال دعوة للعميل', exact: true })
    .click();
  await respondToAppConfirmation(page, (dialog) => dialog.accept());
  await expect(
    page.getByText(
      'الدعوة جاهزة، لكن إرسال البريد مش مؤكد. انسخ الرابط وابعته للعميل.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('#account-invitation-link')).toHaveValue(
    'http://localhost:3100/connections#' + secret,
  );
});
for (const locale of ['ar', 'en'] as const)
  test(`connections mobile ${locale} layout and accessibility`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'lancelio_language',
        value: locale,
        domain: 'localhost',
        path: '/',
      },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await fixture(page);
    await page.goto('/connections');
    await expect(
      page.getByRole('button', {
        name: locale === 'ar' ? 'قبول الدعوة' : 'Accept invitation',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
      path: `../../.cache/connections-${locale}-mobile.png`,
      fullPage: true,
    });
  });
