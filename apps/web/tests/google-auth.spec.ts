import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../../api/src/main/create-app.js';
import { createAuthentication } from '../../api/src/main/create-authentication.js';
import { createGoogleAuthentication } from '../../api/src/main/create-google-authentication.js';
import { connectDatabase } from '../../api/src/main/database.js';
import { createProfile } from '../../api/src/main/create-profile.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../../api/src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../../api/src/modules/auth/infrastructure/session-model.js';
import { JoseGoogleTokenVerifier } from '../../api/src/modules/auth/infrastructure/google-token-verifier.js';
import { RegisterAccount } from '../../api/src/modules/auth/application/register-account.js';
import { MongoRegistrationStore } from '../../api/src/modules/auth/infrastructure/mongo-registration-store.js';
import { Argon2PasswordHasher } from '../../api/src/modules/auth/infrastructure/argon2-password-hasher.js';
import { mongoBinaryOptions } from '../../api/tests/helpers/mongo-binary.js';

const origin = 'http://localhost:3100';
const clientId = 'browser-test.apps.googleusercontent.com';
const secret = 'browser-test-google-key-at-least-thirty-two-characters';
const password = 'existing secure browser test password';
let replica: MongoMemoryReplSet;
let database: Awaited<ReturnType<typeof connectDatabase>>;
let models: ReturnType<typeof createRegistrationModels>;
let sessions: ReturnType<typeof createSessionModel>;
let authentication: Awaited<ReturnType<typeof createAuthentication>>;
let google: Awaited<ReturnType<typeof createGoogleAuthentication>>;
let register: RegisterAccount;
let server: Server;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
test.beforeAll(async () => {
  test.setTimeout(240000);
  replica = await MongoMemoryReplSet.create({
    binary: {
      ...mongoBinaryOptions(),
      downloadDir: resolve(
        import.meta.dirname,
        '../../../.cache/mongodb-binaries',
      ),
    },
    replSet: { count: 1 },
  });
  database = await connectDatabase(replica.getUri('google-browser'));
  models = createRegistrationModels(database);
  await initializeRegistrationModels(models);
  sessions = createSessionModel(database);
  await sessions.createCollection();
  await sessions.createIndexes();
  authentication = await createAuthentication(models, sessions, secret, false);
  keys = await generateKeyPair('RS256');
  google = await createGoogleAuthentication(
    models,
    sessions,
    secret,
    clientId,
    false,
    new JoseGoogleTokenVerifier(
      clientId,
      createLocalJWKSet({
        keys: [
          {
            ...(await exportJWK(keys.publicKey)),
            kid: 'browser',
            alg: 'RS256',
          },
        ],
      }),
    ),
  );
  register = new RegisterAccount(
    new MongoRegistrationStore(database, models),
    new Argon2PasswordHasher(),
  );
});
test.beforeEach(async () => {
  for (const collection of Object.values(database.collections))
    await collection.deleteMany({});
  const app = createApp(origin, {
    sessions: authentication,
    google,
    profile: createProfile(models.User),
  });
  await new Promise<void>((resolveListen, reject) => {
    server = app.listen(5100, 'localhost', () => resolveListen());
    server.once('error', reject);
  });
});
test.afterEach(async () => {
  if (server)
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
      server.closeAllConnections();
    });
});
test.afterAll(async () => {
  await database?.close();
  await replica?.stop();
});

async function chooser(page: Page) {
  await page.exposeFunction('googleFixtureCredential', async (nonce: string) =>
    new SignJWT({
      nonce,
      email: 'browser@gmail.com',
      email_verified: true,
      name: 'Google Browser Name',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'browser' })
      .setIssuer('https://accounts.google.com')
      .setAudience(clientId)
      .setSubject('browser-google-subject')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keys.privateKey),
  );
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `(() => {
    let state;
    window.google = { accounts: { id: {
      initialize(options) { state = options; },
      renderButton(element, options) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = options.locale === 'ar' ? 'المتابعة باستخدام Google' : 'Continue with Google';
        button.style.cssText = 'width:100%;min-height:44px;background:#fff;color:#243b33;border:1px solid #b4c4b8;border-radius:24px;padding:8px 20px;font:inherit;cursor:pointer';
        button.onclick = async () => { const current = state; current.callback({ credential: await window.googleFixtureCredential(current.nonce) }); };
        element.append(button);
      }
    } } };
  })();`,
    }),
  );
}

test('Google registration completes onboarding once and persists a real session across reload', async ({
  page,
  context,
}) => {
  await chooser(page);
  let exchanges = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/auth/google')) exchanges++;
  });
  await page.goto('/register');
  await page
    .getByRole('button', { name: 'المتابعة باستخدام Google', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'خطوة أخيرة لمساحتك' }),
  ).toBeVisible();
  await expect(page.locator('#google-name')).toBeFocused();
  await expect(page.locator('#google-name')).toHaveValue('Google Browser Name');
  await expect(page.locator('#email')).toBeHidden();
  expect(await models.User.countDocuments()).toBe(0);
  await page.locator('#google-name').fill('الاسم المحلي');
  await page.locator('#google-workspace').fill('استوديو Google');
  await page.getByRole('button', { name: 'إنشاء مساحتي والمتابعة' }).dblclick();
  await expect(page).toHaveURL(/\/dashboard$/u);
  expect(exchanges).toBe(2);
  expect(await models.User.countDocuments()).toBe(1);
  expect(await models.Workspace.countDocuments()).toBe(1);
  const cookies = await context.cookies();
  expect(
    cookies.some(
      (cookie) => cookie.name === 'lancelio_refresh' && cookie.httpOnly,
    ),
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === 'lancelio_google')).toBe(
    false,
  );
  await page.goto('/settings');
  await expect(page.getByLabel('الاسم الشخصي', { exact: true })).toHaveValue(
    'الاسم المحلي',
  );
  await page.reload();
  await expect(page.getByLabel('الاسم الشخصي', { exact: true })).toHaveValue(
    'الاسم المحلي',
  );
  expect(
    await page.evaluate(() => Object.values(localStorage).join(' ')),
  ).not.toMatch(/eyJ|existing secure/);
});

test('Google signs straight into the existing account without a password prompt and preserves its workspace', async ({
  page,
}) => {
  const local = await register.execute({
    name: 'Original User',
    email: 'browser@gmail.com',
    password,
    workspaceName: 'Original Workspace',
  });
  await chooser(page);
  await page.goto('/login');
  await page
    .getByRole('button', { name: 'المتابعة باستخدام Google', exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.locator('#google-link-password')).toHaveCount(0);
  const user = await models.User.findOne()
    .select('+googleSubject +passwordLoginNeedsVerification')
    .orFail();
  expect(user.passwordLoginNeedsVerification).toBe(true);
  expect(user.id).toBe(local.user.id);
  expect(user.name).toBe('Original User');
  expect(user.googleSubject).toBe('browser-google-subject');
  expect((await models.Workspace.findOne().orFail()).name).toBe(
    'Original Workspace',
  );
});

test('unconfigured or blocked Google leaves password sign-in usable and sends no credentials to browser storage', async ({
  page,
}) => {
  await page.route('**/auth/google/config', (route) =>
    route.fulfill({ json: { success: true, data: { enabled: false } } }),
  );
  let libraryCalls = 0;
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/'))
      libraryCalls++;
  });
  await page.goto('/login');
  await expect(
    page.getByLabel('البريد الإلكتروني', { exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.google-auth')).toHaveCount(0);
  expect(libraryCalls).toBe(0);
  await page.unroute('**/auth/google/config');
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.abort(),
  );
  await page.reload();
  await expect(page.locator('.google-auth [role="alert"]')).toContainText(
    'تعذّر تحميل Google',
  );
  await expect(
    page.getByLabel('البريد الإلكتروني', { exact: true }),
  ).toBeEnabled();
  await expect(page.locator('#password')).toBeEnabled();
});

test('Google onboarding responsive audit remains usable in both languages and supports explicit cancellation', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90000);
  await chooser(page);
  for (const locale of ['ar', 'en']) {
    await context.addCookies([
      { name: 'lancelio_language', value: locale, url: origin },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/register');
    await page
      .getByRole('button', {
        name:
          locale === 'ar' ? 'المتابعة باستخدام Google' : 'Continue with Google',
        exact: true,
      })
      .click();
    await expect(page.locator('#google-name')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page.screenshot({
      path: `.cache/ui/google-onboarding-${locale}-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', {
        name:
          locale === 'ar'
            ? 'اختيار حساب Google آخر'
            : 'Choose another Google account',
      })
      .click();
    await expect(page.locator('#google-name')).toHaveCount(0);
    await expect(page.locator('#email')).toBeVisible();
  }
  expect(await models.User.countDocuments()).toBe(0);
  expect(await sessions.countDocuments()).toBe(0);
});
