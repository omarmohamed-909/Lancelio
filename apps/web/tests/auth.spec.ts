import { selectOption } from './select-option';
import { respondToAppConfirmation } from './app-confirmation';
import AxeBuilder from '@axe-core/playwright';
import { Types } from 'mongoose';
import { createProfile } from '../../api/src/main/create-profile.js';
import { createWorkspaceSettings } from '../../api/src/main/create-workspace-settings.js';
import { createPasswordChange } from '../../api/src/main/create-password-change.js';
import { createPasswordRecovery } from '../../api/src/main/create-password-recovery.js';
import { createNotifications } from '../../api/src/main/create-notifications.js';
import { createNotificationStateModel } from '../../api/src/modules/notifications/infrastructure/notification-state-model.js';
import { formatOverviewMoney } from '../src/features/dashboard/utils/format-overview-money';
import { createPortal } from '../../api/src/main/create-portal.js';
import { createPortalModel } from '../../api/src/modules/portal/infrastructure/portal-model.js';
import { createDashboard } from '../../api/src/main/create-dashboard.js';
import { createSearch } from '../../api/src/main/create-search.js';
import { createAssistant } from '../../api/src/main/create-assistant.js';
import { createPayments } from '../../api/src/main/create-payments.js';
import { createPaymentLedgerModel } from '../../api/src/modules/payments/infrastructure/payment-ledger-model.js';
import { createInvoiceSharing } from '../../api/src/main/create-invoice-sharing.js';
import { createInvoices } from '../../api/src/main/create-invoices.js';
import {
  createInvoiceModels,
  initializeInvoiceModels,
} from '../../api/src/modules/invoices/infrastructure/invoice-model.js';
import { createTasks } from '../../api/src/main/create-tasks.js';
import { createTaskBoardModel } from '../../api/src/modules/tasks/infrastructure/task-board-model.js';
import {
  defineResponsiveTests,
  inspectResponsiveLayout,
} from './responsive-audit';
import { randomUUID } from 'node:crypto';
import { createProposalDecisions } from '../../api/src/main/create-proposal-decisions.js';
import { createProjectModel } from '../../api/src/modules/projects/infrastructure/project-model.js';
import { createProjects } from '../../api/src/main/create-projects.js';
import { createProposalSharing } from '../../api/src/main/create-proposal-sharing.js';
import { createProposals } from '../../api/src/main/create-proposals.js';
import { createProposalModel } from '../../api/src/modules/proposals/infrastructure/proposal-model.js';
import type { ManageProposals } from '../../api/src/modules/proposals/application/manage-proposals.js';
import { ManageClients } from '../../api/src/modules/clients/application/manage-clients.js';
import { createClientModel } from '../../api/src/modules/clients/infrastructure/client-model.js';
import { MongoClientStore } from '../../api/src/modules/clients/infrastructure/mongo-client-store.js';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../../api/src/main/create-app.js';
import { createAuthentication } from '../../api/src/main/create-authentication.js';
import {
  checkDatabaseReadiness,
  connectDatabase,
} from '../../api/src/main/database.js';
import { RegisterAccount } from '../../api/src/modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../../api/src/modules/auth/infrastructure/argon2-password-hasher.js';
import { MongoRegistrationStore } from '../../api/src/modules/auth/infrastructure/mongo-registration-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../../api/src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../../api/src/modules/auth/infrastructure/session-model.js';
import { createConsumedRefreshModel } from '../../api/src/modules/auth/infrastructure/consumed-refresh-model.js';
import { mongoBinaryOptions } from '../../api/tests/helpers/mongo-binary.js';

let notificationStates: ReturnType<typeof createNotificationStateModel>;
let portalModel: ReturnType<typeof createPortalModel>;
let paymentModel: ReturnType<typeof createPaymentLedgerModel>;
let invoiceModels: ReturnType<typeof createInvoiceModels>;
let replica: MongoMemoryReplSet;
let database: Awaited<ReturnType<typeof connectDatabase>>;
let models: ReturnType<typeof createRegistrationModels>;
let sessionModel: ReturnType<typeof createSessionModel>;
let consumed: ReturnType<typeof createConsumedRefreshModel>;
let sessions: Awaited<ReturnType<typeof createAuthentication>>;
let passwordRecovery: Awaited<ReturnType<typeof createPasswordRecovery>>;
let passwordChange: Awaited<ReturnType<typeof createPasswordChange>>;
const recoveryMail: { email: string; token: string }[] = [];
const releaseAuditFailures: unknown[] = [];

let registerAccount: RegisterAccount;
let server: Server;
let now: Date;
let shareNow: Date;
let clientModel: ReturnType<typeof createClientModel>;
let clients: ManageClients;
let proposals: ManageProposals;
let projectModel: ReturnType<typeof createProjectModel>;
let taskBoardModel: ReturnType<typeof createTaskBoardModel>;
let proposalModel: ReturnType<typeof createProposalModel>;
const account = {
  name: 'أحمد علي',
  email: 'ahmed@example.com',
  password: 'a long secure test passphrase',
  workspaceName: 'استوديو أحمد',
};
const testOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:3100';

test.beforeAll(async () => {
  test.setTimeout(240_000);
  replica = await MongoMemoryReplSet.create({
    binary: {
      ...mongoBinaryOptions(),
      downloadDir: resolve(
        import.meta.dirname,
        '../../../.cache/mongodb-binaries',
      ),
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  database = await connectDatabase(replica.getUri('browser-tests'));
  notificationStates = createNotificationStateModel(database);
  await notificationStates.createCollection();
  await notificationStates.createIndexes();
  portalModel = createPortalModel(database);
  await portalModel.createCollection();
  await portalModel.createIndexes();
  paymentModel = createPaymentLedgerModel(database);
  await paymentModel.createCollection();
  await paymentModel.createIndexes();
  clientModel = createClientModel(database);
  await clientModel.createCollection();
  await clientModel.createIndexes();
  clients = new ManageClients(new MongoClientStore(clientModel));
  proposalModel = createProposalModel(database);
  await proposalModel.createCollection();
  await proposalModel.createIndexes();
  projectModel = createProjectModel(database);
  await projectModel.createCollection();
  await projectModel.createIndexes();
  taskBoardModel = createTaskBoardModel(database);
  await taskBoardModel.createCollection();
  await taskBoardModel.createIndexes();
  invoiceModels = createInvoiceModels(database);
  await initializeInvoiceModels(invoiceModels);
  proposals = createProposals(database, proposalModel, clientModel);
  models = createRegistrationModels(database);
  await initializeRegistrationModels(models);
  sessionModel = createSessionModel(database);
  await sessionModel.createCollection();
  await sessionModel.createIndexes();
  sessions = await createAuthentication(
    models,
    sessionModel,
    'browser-test-signing-secret-at-least-32-characters',
    process.env.E2E_SECURE_COOKIES === 'true',
    { now: () => now },
  );
  passwordRecovery = await createPasswordRecovery(
    models.User,
    sessionModel,
    'browser-test-signing-secret-at-least-32-characters',
    {
      send: async (email, token) => {
        recoveryMail.push({ email, token });
      },
    },
    { now: () => now },
  );
  consumed = createConsumedRefreshModel(database);
  passwordChange = await createPasswordChange(
    models,
    sessionModel,
    passwordRecovery.models.Job,
    { now: () => now },
  );
  registerAccount = new RegisterAccount(
    new MongoRegistrationStore(database, models),
    new Argon2PasswordHasher(),
  );
});

test.beforeEach(async () => {
  releaseAuditFailures.length = 0;
  await passwordChange.attempts.deleteMany({});
  recoveryMail.length = 0;
  await passwordRecovery.models.Job.deleteMany({});
  await passwordRecovery.models.Mailbox.deleteMany({});
  now = new Date();
  shareNow = new Date();
  await notificationStates.deleteMany({});
  await portalModel.deleteMany({});
  await paymentModel.deleteMany({});
  await invoiceModels.Invoice.deleteMany({});
  await invoiceModels.Counter.deleteMany({});
  await taskBoardModel.deleteMany({});
  await proposalModel.deleteMany({});
  await projectModel.deleteMany({});
  await clientModel.deleteMany({});
  await consumed.deleteMany({});
  await sessionModel.deleteMany({});
  await models.Membership.deleteMany({});
  await models.Workspace.deleteMany({});
  await models.User.deleteMany({});
  const app = createApp(testOrigin, {
    assistant: createAssistant(
      database,
      {
        projects: projectModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
        payments: paymentModel.collection.name,
      },
      createDashboard(
        database,
        {
          clients: clientModel.collection.name,
          proposals: proposalModel.collection.name,
          projects: projectModel.collection.name,
          tasks: taskBoardModel.collection.name,
          invoices: invoiceModels.Invoice.collection.name,
          payments: paymentModel.collection.name,
        },
        () => shareNow,
      ),
      createSearch(database, {
        clients: clientModel.collection.name,
        projects: projectModel.collection.name,
        proposals: proposalModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
      }),
      null,
      () => shareNow,
    ),
    checkReadiness: () => checkDatabaseReadiness(database),
    profile: createProfile(models.User),
    workspaceSettings: createWorkspaceSettings(models),
    passwordChange: passwordChange.service,
    passwordRecovery: passwordRecovery.service,
    notifications: createNotifications(
      database,
      notificationStates,
      {
        proposals: proposalModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
        payments: paymentModel.collection.name,
      },
      () => shareNow,
    ),
    sessions,
    search: createSearch(database, {
      clients: clientModel.collection.name,
      projects: projectModel.collection.name,
      proposals: proposalModel.collection.name,
      invoices: invoiceModels.Invoice.collection.name,
    }),
    dashboard: createDashboard(
      database,
      {
        clients: clientModel.collection.name,
        proposals: proposalModel.collection.name,
        projects: projectModel.collection.name,
        tasks: taskBoardModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
        payments: paymentModel.collection.name,
      },
      () => shareNow,
    ),
    portal: createPortal(
      database,
      portalModel,
      {
        clients: clientModel.collection.name,
        workspaces: models.Workspace.collection.name,
        projects: projectModel.collection.name,
        tasks: taskBoardModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
        payments: paymentModel.collection.name,
      },
      () => shareNow,
    ),
    registerAccount,
    clients,
    payments: createPayments(
      paymentModel,
      invoiceModels.Invoice,
      () => shareNow,
    ),
    invoices: createInvoices(
      database,
      invoiceModels,
      clientModel,
      projectModel,
      () => shareNow,
    ),
    invoiceSharing: createInvoiceSharing(invoiceModels, () => shareNow),
    proposals,
    decisions: createProposalDecisions(
      database,
      proposalModel,
      projectModel,
      () => shareNow,
    ),
    projects: createProjects(database, projectModel, clientModel),
    tasks: createTasks(database, taskBoardModel, projectModel),
    sharing: createProposalSharing(proposalModel, () => shareNow),
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
      // The test owns this server; dispose browser connections after assertions.
      server.closeAllConnections();
    });
  expect(releaseAuditFailures, 'Release accessibility audit').toEqual([]);
});
test.afterAll(async () => {
  await database?.close();
  await replica?.stop();
});

async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('اسمك', { exact: true }).fill(account.name);
  await page.getByLabel('البريد الإلكتروني').fill(account.email);
  await page.getByLabel('اسم مساحة العمل').fill(account.workspaceName);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'إنشاء حسابي' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    account.name,
  );
}
async function login(page: Page, password = account.password) {
  await page.getByLabel('البريد الإلكتروني').fill(account.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'دخول لمساحتك' }).click();
}

test('register, real identity, logout, unauthorized redirect, and login', async ({
  page,
  context,
}) => {
  await register(page);
  await expect(page.locator('.account-panel')).toContainText(
    account.workspaceName,
  );
  await expect(page.locator('.account-panel')).toContainText(account.email);
  await expect(page.locator('.account-panel')).toContainText('مالك المساحة');
  const cookie = (await context.cookies()).find(
    (item) => item.name === 'lancelio_refresh',
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/dashboard-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  expect(
    (await context.cookies()).some((item) => item.name === 'lancelio_refresh'),
  ).toBe(false);
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/login');
  await login(page, 'incorrect test password');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'غير صحيحة',
  );
  await login(page);
  await expect(page).toHaveURL('/dashboard');
});

test('validation, password visibility, duplicate registration, and single submit', async ({
  page,
}) => {
  await registerAccount.execute(account);
  await page.goto('/register');
  await page.getByLabel('اسمك', { exact: true }).fill(account.name);
  await page.getByLabel('البريد الإلكتروني').fill(account.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'إنشاء حسابي' }).click();
  await expect(page.locator('#password-error')).toBeVisible();
  expect(await models.User.countDocuments()).toBe(1);
  await page.getByRole('button', { name: 'إظهار كلمة المرور' }).click();
  await expect(page.locator('#password')).toHaveAttribute('type', 'text');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(account.password);
  let requests = 0;
  let release: () => void = () => undefined;
  const heldRequest = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/auth/register', async (route) => {
    requests++;
    await heldRequest;
    await route.continue();
  });
  // Two synchronous submit events exercise the guard before React can rerender.
  await page.locator('form').evaluate((form) => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator('button[type=submit]')).toBeDisabled();
  release();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مسجل بالفعل',
  );
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'إخفاء كلمة المرور' }).click();
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/register-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
});

test('reload and concurrent tabs rotate safely, logout synchronizes', async ({
  page,
  context,
}) => {
  await register(page);
  const second = await context.newPage();
  await Promise.all([page.reload(), second.goto('/dashboard')]);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    account.name,
  );
  await expect(second.getByRole('heading', { level: 1 })).toContainText(
    account.name,
  );
  expect(await sessionModel.countDocuments({ revokedAt: null })).toBe(1);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(second).toHaveURL('/login');
});

test('expired access refreshes, expired session returns to login', async ({
  page,
}) => {
  await register(page);
  now = new Date(now.getTime() + 901_000);
  const refreshResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/auth/refresh') && response.status() === 200,
  );
  await page.getByRole('button', { name: 'تحديث بيانات المساحة' }).click();
  await refreshResponse;
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    account.name,
  );
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  now = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
  await page.getByRole('button', { name: 'تحديث بيانات المساحة' }).click();
  await expect(page).toHaveURL('/login');
});

test('mobile RTL layout, keyboard login, and logout failure recovery', async ({
  page,
}) => {
  await registerAccount.execute(account);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByLabel('البريد الإلكتروني').fill(account.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(account.password);
  await page.getByLabel('كلمة المرور', { exact: true }).press('Enter');
  await expect(page).toHaveURL('/dashboard');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/dashboard-mobile.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await page.route('**/auth/logout', (route) => route.abort());
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'نتصل بالخدمة',
  );
  await expect(page).toHaveURL('/dashboard');
  await page.unroute('**/auth/logout');
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.screenshot({
    path: resolve(import.meta.dirname, '../../../.cache/ui/login-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
});

test('unavailable restoration shows a recoverable error without retry loops', async ({
  page,
}) => {
  await page.route('**/auth/refresh', (route) => route.abort());
  await page.goto('/dashboard');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'نتصل بالخدمة',
  );
  await expect(
    page.getByRole('button', { name: 'إعادة الاتصال' }),
  ).toBeVisible();
  await page.unroute('**/auth/refresh');
  await page.getByRole('button', { name: 'إعادة الاتصال' }).click();
  await expect(page).toHaveURL('/login');
});

test('failed refresh pauses automatic renewal until explicit recovery', async ({
  page,
}) => {
  await register(page);
  now = new Date(now.getTime() + 901_000);
  let attempts = 0;
  await page.route('**/auth/refresh', (route) => {
    attempts++;
    return route.abort();
  });
  await page.getByRole('button', { name: 'تحديث بيانات المساحة' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'نتصل بالخدمة',
  );
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(attempts).toBe(1);
  await page.unroute('**/auth/refresh');
  await page.getByRole('button', { name: 'إعادة الاتصال' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    account.name,
  );
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

async function finishEntrance(page: Page) {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        (animation) => animation.effect?.getTiming().iterations !== Infinity,
      );
    await Promise.all(
      finite.map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

test('reduced motion preserves content and mobile navigation traps and restores focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  await expect(page.locator('.welcome-panel')).toBeVisible();
  expect(
    await page
      .locator('.welcome-panel')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  expect(
    await page
      .locator('.module-card')
      .first()
      .evaluate((element) => getComputedStyle(element).opacity),
  ).toBe('1');
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  const dialog = page.getByRole('dialog', { name: 'قائمة مساحة العمل' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'إغلاق القائمة' }),
  ).toBeFocused();
  expect(
    await page
      .locator('.workspace-main')
      .evaluate((element) => element instanceof HTMLElement && element.inert),
  ).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    'hidden',
  );
  await dialog.getByRole('button', { name: 'تسجيل الخروج' }).focus();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('link', { name: 'Lancelio — الرئيسية' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'تسجيل الخروج' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'فتح القائمة' })).toBeFocused();
  expect(
    await page
      .locator('#workspace-navigation')
      .evaluate((element) => element instanceof HTMLElement && element.inert),
  ).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(dialog).toHaveCount(0);
  expect(
    await page
      .locator('.workspace-main')
      .evaluate((element) => element instanceof HTMLElement && element.inert),
  ).toBe(false);
  await expect(
    page.getByRole('link', { name: 'نظرة عامة', exact: true }),
  ).toBeFocused();
});

test('visual refresh reveals surfaces once, keeps quick actions usable and respects reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  const card = page.locator('.module-card').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-viewport-entered', 'true');
  await finishEntrance(page);
  await expect(card).toHaveCSS('opacity', '1');
  await expect(card).toHaveCSS('transform', 'none');
  await page.locator('.dashboard-hero').scrollIntoViewIfNeeded();
  await card.scrollIntoViewIfNeeded();
  expect(await card.evaluate((element) => element.getAnimations().length)).toBe(
    0,
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(card).not.toHaveAttribute('data-viewport-entered');
  await expect(card).toHaveCSS('animation-name', 'none');
  await page.locator('.dashboard-hero').scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'عرض سعر جديد', exact: true }).click();
  await expect(page).toHaveURL('/proposals/new');
  await expect(page.getByLabel('وصف البند 1', { exact: true })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.locator('.overview-counts article')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/visual-refresh/dashboard-desktop.png',
    ),
    animations: 'disabled',
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/visual-refresh/dashboard-${width}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/visual-refresh/login-${width}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('normal interaction motion settles, preserves focus and records the real journey', async ({
  browser,
}) => {
  await registerAccount.execute(account);
  const context = await browser.newContext({
    baseURL: 'http://localhost:3100',
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'no-preference',
    recordVideo: {
      dir: resolve(import.meta.dirname, '../../../.cache/ui/video'),
      size: { width: 1280, height: 900 },
    },
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await page.goto('/login');
    expect(
      await page
        .locator('.auth-form-wrap')
        .evaluate((element) => getComputedStyle(element).animationName),
    ).not.toBe('none');
    await finishEntrance(page);
    await expect(page.locator('.desk-invoice')).toBeVisible();
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        '../../../.cache/ui/login-desktop.png',
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await login(page);
    await expect(page).toHaveURL('/dashboard');
    await finishEntrance(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      account.name,
    );
    expect(
      await page
        .locator('.account-panel')
        .evaluate((element) => getComputedStyle(element).opacity),
    ).toBe('1');
    await page.getByRole('button', { name: 'تحديث بيانات المساحة' }).hover();
    await page.getByRole('button', { name: 'تحديث بيانات المساحة' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await openClients(page);
    await newClient(page);
    await finishEntrance(page);
    await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
    await page
      .getByRole('button', { name: 'إضافة العميل', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/proposals/new');
    await expect(page.getByLabel('وصف البند 1', { exact: true })).toBeVisible();
    await expect(page.locator('.proposal-item').first()).toHaveCSS(
      'animation-name',
      'none',
    );
    await fillDraft(page);
    const added = page.locator('.proposal-item').last();
    await finishEntrance(page);
    await expect(added).toHaveCSS('opacity', '1');
    await expect(added).toHaveCSS('transform', 'none');
    await page
      .getByRole('button', { name: 'تغيير العميل', exact: true })
      .click();
    await finishEntrance(page);
    await page
      .getByLabel('البحث عن عميل للعرض', { exact: true })
      .press('Escape');
    await expect(
      page.getByRole('button', { name: 'تغيير العميل', exact: true }),
    ).toBeFocused();
    await finishEntrance(page);
    await expect(page.locator('.proposal-selected-client')).toHaveCSS(
      'opacity',
      '1',
    );
    await page.getByRole('button', { name: 'إضافة بند', exact: true }).click();
    await expect(page.getByLabel('وصف البند 3', { exact: true })).toBeFocused();
    await finishEntrance(page);
    await page
      .getByRole('button', { name: 'حذف البند 3', exact: true })
      .click();
    await expect(page.locator('.proposal-item')).toHaveCount(2);
  } finally {
    await context.close();
  }
  if (video)
    await video.saveAs(
      resolve(import.meta.dirname, '../../../.cache/ui/motion-preview.webm'),
    );
});

async function openClients(page: Page) {
  await page.getByRole('link', { name: 'افتح دفتر العملاء' }).click();
  await expect(page).toHaveURL('/clients');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'دفتر العملاء',
  );
  await expect(page.getByText('بنفتح دفتر العملاء…')).toHaveCount(0);
}
async function newClient(page: Page, name = 'سارة علي') {
  await page.getByRole('button', { name: 'عميل جديد', exact: true }).click();
  await page.getByLabel('اسم العميل', { exact: true }).fill(name);
  await page.getByLabel('بريد العميل').fill('sara@example.com');
  await page.getByLabel('رقم الهاتف').fill('+20 100 555 4444');
  await page.getByLabel('الشركة').fill('استوديو سارة');
  await page.getByLabel('ملاحظات').fill('التواصل بالبريد صباحًا');
}

test('client creation, validation, single submit, editing, archive and persisted records', async ({
  page,
}) => {
  await register(page);
  await openClients(page);
  await expect(
    page.getByRole('heading', { name: 'أول اسم، وبداية شغل جديدة.' }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(import.meta.dirname, '../../../.cache/ui/clients-empty.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'عميل جديد', exact: true }).click();
  await expect(page.getByLabel('اسم العميل', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'إضافة العميل', exact: true }).click();
  await expect(page.locator('#client-name-error')).toBeVisible();
  await page.getByLabel('اسم العميل', { exact: true }).fill('سارة علي');
  await page.getByLabel('بريد العميل').fill('sara@example.com');
  await page.getByLabel('رقم الهاتف').fill('+20 100 555 4444');
  await page.getByLabel('الشركة').fill('استوديو سارة');
  await page.getByLabel('ملاحظات').fill('التواصل بالبريد صباحًا');
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/client-dialog-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  let submissions = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  await page.route('**/api/v1/clients', async (route) => {
    submissions++;
    await gate;
    await route.continue();
  });
  await page.locator('dialog form').evaluate((form) => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  await expect(
    page.getByRole('button', { name: 'جارٍ الحفظ…' }),
  ).toBeDisabled();
  await expect.poll(() => submissions).toBe(1);
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unroute('**/api/v1/clients');
  await expect(
    page.getByRole('heading', { name: 'سارة علي', exact: true }),
  ).toBeVisible();
  expect(await clientModel.countDocuments()).toBe(1);
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/clients-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: 'تعديل سارة علي', exact: true })
    .click();
  await expect(page.getByLabel('ملاحظات')).toHaveValue(
    'التواصل بالبريد صباحًا',
  );
  await page.getByLabel('اسم العميل', { exact: true }).fill('سارة أحمد');
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(
    page.getByRole('heading', { name: 'سارة أحمد', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'عميل جديد', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'أرشفة سارة أحمد' }).click();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'أرشفة سارة أحمد' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'أرشفة سارة أحمد' }).click();
  await page.getByRole('button', { name: 'تأكيد الأرشفة' }).click();
  await expect(
    page.getByRole('heading', { name: 'أول اسم، وبداية شغل جديدة.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'المؤرشفون', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'سارة أحمد', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'عرض بيانات سارة أحمد' }).click();
  await expect(page.getByLabel('اسم العميل', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  );
  await expect(page.getByRole('button', { name: 'حفظ التعديلات' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'المؤرشفون', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'سارة أحمد', exact: true }),
  ).toBeVisible();
  expect(await clientModel.countDocuments()).toBe(1);
  await newClient(page, 'شركة جديدة');
  await page.getByRole('button', { name: 'إضافة العميل', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'الحاليون', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'شركة جديدة', exact: true }),
  ).toBeVisible();
  expect(await clientModel.countDocuments()).toBe(2);
});

test('client edits preserve newer data, reload a conflict, and renew expired access once', async ({
  page,
}) => {
  await register(page);
  await openClients(page);
  await newClient(page);
  now = new Date(now.getTime() + 901_000);
  await page.getByRole('button', { name: 'إضافة العميل', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'سارة علي', exact: true }),
  ).toBeVisible();
  expect(await clientModel.countDocuments()).toBe(1);
  await page
    .getByRole('button', { name: 'تعديل سارة علي', exact: true })
    .click();
  await page.getByLabel('ملاحظات').fill('نسخة محلية قديمة');
  await clientModel.updateOne(
    {},
    { $set: { notes: 'نسخة أحدث من جهاز آخر' }, $inc: { version: 1 } },
  );
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'اتغيرت من مكان تاني',
  );
  await expect(
    page.getByRole('button', { name: 'حفظ التعديلات' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'تحميل آخر نسخة' }).click();
  await expect(page.getByLabel('ملاحظات')).toHaveValue('نسخة أحدث من جهاز آخر');
  await page.getByLabel('ملاحظات').fill('اتفاق نهائي');
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await clientModel.findOne().orFail()).notes).toBe('اتفاق نهائي');
  expect((await clientModel.findOne().orFail()).version).toBe(3);
});

test('client mobile layout, reduced motion, dialog keyboard and workspace isolation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await register(page);
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'العملاء', exact: true })
    .click();
  await expect(page).toHaveURL('/clients');
  await expect(page.locator('.workspace-main')).not.toHaveAttribute(
    'inert',
    '',
  );
  await newClient(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'none');
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/client-dialog-mobile.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'إضافة العميل', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'سارة علي', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(import.meta.dirname, '../../../.cache/ui/clients-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await registerAccount.execute({
    ...account,
    email: 'second@example.com',
    workspaceName: 'مساحة أخرى',
  });
  await page.getByLabel('البريد الإلكتروني').fill('second@example.com');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'دخول لمساحتك' }).click();
  await expect(page).toHaveURL('/dashboard');
  await openClients(page);
  await expect(
    page.getByRole('heading', { name: 'أول اسم، وبداية شغل جديدة.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'سارة علي', exact: true }),
  ).toHaveCount(0);
});

test('a lost create response is not retried and the committed client can be recovered', async ({
  page,
}) => {
  await register(page);
  await openClients(page);
  await newClient(page);
  let writes = 0;
  await page.route('**/api/v1/clients', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'إضافة العميل', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'مش قادرين نتأكد',
  );
  await expect(
    page.getByRole('button', { name: 'إضافة العميل', exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  expect(await clientModel.countDocuments()).toBe(1);
  await page.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await page.unroute('**/api/v1/clients');
  await page.getByRole('button', { name: 'تحديث قائمة العملاء' }).click();
  await expect(
    page.getByRole('heading', { name: 'سارة علي', exact: true }),
  ).toBeVisible();
});

async function seedSearchClients() {
  const workspace = await models.Workspace.findOne().orFail();
  await clientModel.insertMany([
    ...Array.from({ length: 28 }, (_, index) => ({
      workspace: workspace._id,
      name: 'عميل ' + index.toString().padStart(2, '0'),
      company: 'استوديو النور',
      email: 'client' + index + '@example.com',
      phone:
        index % 2 === 0
          ? '+20 100 000 ' + index.toString().padStart(4, '0')
          : '',
    })),
    { workspace: workspace._id, name: 'سارة علي', company: 'ورشة سارة' },
    {
      workspace: workspace._id,
      name: 'محمود أحمد',
      email: 'mahmoud@example.com',
    },
    {
      workspace: workspace._id,
      name: 'سارة المؤرشفة',
      company: 'استوديو النور',
      email: 'archived@example.com',
      archivedAt: new Date(),
    },
  ]);
}
async function settledClients(page: Page) {
  await expect(page.locator('.client-book')).toHaveAttribute(
    'aria-busy',
    'false',
  );
}

test('client search combines contact/status filters, retains page criteria and resets the cursor', async ({
  page,
}) => {
  await register(page);
  await seedSearchClients();
  await openClients(page);
  const queries: URLSearchParams[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/clients' && request.method() === 'GET')
      queries.push(url.searchParams);
  });
  await page.getByLabel('البحث عن عميل').fill('النور');
  await settledClients(page);
  await expect(page.locator('.client-list > li')).toHaveCount(25);
  await page.getByRole('button', { name: 'عرض المزيد', exact: true }).click();
  await expect(page.locator('.client-list > li')).toHaveCount(28);
  expect(queries.at(-1)?.get('q')).toBe('النور');
  expect(queries.at(-1)?.get('contact')).toBe('all');
  expect(queries.at(-1)?.has('cursor')).toBe(true);
  await selectOption(
    page.getByRole('combobox', { name: 'بيانات التواصل', ...{ exact: true } }),
    'phone',
  );
  await settledClients(page);
  await expect(page.locator('.client-list > li')).toHaveCount(14);
  expect(queries.at(-1)?.has('cursor')).toBe(false);
  await page.getByLabel('البحث عن عميل').fill('عميل 2');
  await settledClients(page);
  await expect(page.locator('.client-list > li')).toHaveCount(4);
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/client-search-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await selectOption(
    page.getByRole('combobox', { name: 'بيانات التواصل', ...{ exact: true } }),
    'none',
  );
  await expect(
    page.getByRole('heading', { name: 'مفيش نتائج للاختيارات دي.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'مسح البحث والفلترة', exact: true })
    .click();
  await settledClients(page);
  await expect(page.getByLabel('البحث عن عميل')).toHaveValue('');
  await expect(
    page.getByRole('combobox', { name: 'بيانات التواصل', ...{ exact: true } }),
  ).toHaveAttribute('value', 'all');
  await expect(page.locator('.client-list > li')).toHaveCount(25);
  await page.getByLabel('البحث عن عميل').fill('SARA');
  await expect(
    page.getByRole('heading', { name: 'مفيش نتائج للاختيارات دي.' }),
  ).toBeVisible();
  await page.getByLabel('البحث عن عميل').fill('MAHMOUD@EXAMPLE');
  await settledClients(page);
  await expect(
    page.getByRole('heading', { name: 'محمود أحمد', exact: true }),
  ).toBeVisible();
  await page.getByLabel('البحث عن عميل').fill('سارة');
  await settledClients(page);
  await expect(
    page.getByRole('heading', { name: 'سارة علي', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'المؤرشفون', exact: true }).click();
  await settledClients(page);
  await expect(
    page.getByRole('heading', { name: 'سارة المؤرشفة', exact: true }),
  ).toBeVisible();
  expect(queries.at(-1)?.get('q')).toBe('سارة');
  expect(queries.at(-1)?.has('cursor')).toBe(false);
});

test('client search debounces typing without losing input focus', async ({
  page,
}) => {
  await register(page);
  await seedSearchClients();
  await openClients(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  let searches = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/clients' && url.searchParams.has('q'))
      searches++;
  });
  const input = page.getByLabel('البحث عن عميل');
  await input.fill('س');
  await input.fill('سار');
  await input.fill('سارة');
  await page.clock.runFor(299);
  expect(searches).toBe(0);
  await expect(input).toBeFocused();
  await page.clock.runFor(1);
  await expect(
    page.getByRole('heading', { name: 'سارة علي', exact: true }),
  ).toBeVisible();
  expect(searches).toBe(1);
  await expect(input).toBeFocused();
});

test('late search and page responses cannot replace newer client results', async ({
  page,
}) => {
  await register(page);
  await seedSearchClients();
  await openClients(page);
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const intercepted = new Promise<void>((resolveStarted) => {
    started = resolveStarted;
  });
  await page.route('**/api/v1/clients?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('q') !== 'سارة') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByLabel('البحث عن عميل').fill('سارة');
  await intercepted;
  await page.getByLabel('البحث عن عميل').fill('محمود');
  await expect(
    page.getByRole('heading', { name: 'محمود أحمد', exact: true }),
  ).toBeVisible();
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(
    page.getByRole('heading', { name: 'سارة علي', exact: true }),
  ).toHaveCount(0);
  let releasePage: () => void = () => undefined;
  let startedPage: () => void = () => undefined;
  const pageGate = new Promise<void>((resolveGate) => {
    releasePage = resolveGate;
  });
  const pageIntercepted = new Promise<void>((resolveStarted) => {
    startedPage = resolveStarted;
  });
  await page.route('**/api/v1/clients?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (!query.has('cursor')) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    startedPage();
    await pageGate;
    await route.fulfill({ response });
  });
  await page.getByLabel('البحث عن عميل').fill('النور');
  await settledClients(page);
  await page.getByRole('button', { name: 'عرض المزيد', exact: true }).click();
  await pageIntercepted;
  await page.getByLabel('البحث عن عميل').fill('محمود');
  await expect(
    page.getByRole('heading', { name: 'محمود أحمد', exact: true }),
  ).toBeVisible();
  releasePage();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.locator('.client-list > li')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'عرض المزيد', exact: true }),
  ).toHaveCount(0);
});

test('mobile search has explicit failure recovery and keeps the selected filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await register(page);
  await seedSearchClients();
  await openClients(page);
  let failures = 0;
  await page.route('**/api/v1/clients?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('q') === 'محمود' && failures === 0) {
      failures++;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByLabel('البحث عن عميل').fill('محمود');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش قادرين نتصل',
  );
  expect(failures).toBe(1);
  await expect(page.getByLabel('البحث عن عميل')).toHaveValue('محمود');
  await page
    .getByRole('button', { name: 'إعادة المحاولة', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'محمود أحمد', exact: true }),
  ).toBeVisible();
  await selectOption(
    page.getByRole('combobox', { name: 'بيانات التواصل', ...{ exact: true } }),
    'email',
  );
  await settledClients(page);
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/client-search-mobile.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel('البحث عن عميل').focus();
  await page.keyboard.press('Escape');
  await settledClients(page);
  await expect(page.getByLabel('البحث عن عميل')).toHaveValue('');
  await expect(page.getByLabel('البحث عن عميل')).toBeFocused();
  await expect(
    page.getByRole('combobox', { name: 'بيانات التواصل', ...{ exact: true } }),
  ).toHaveAttribute('value', 'email');
});

test('a failed client page retains rows and retries the same cursor and filters', async ({
  page,
}) => {
  await register(page);
  await seedSearchClients();
  await openClients(page);
  await page.getByLabel('البحث عن عميل').fill('النور');
  await settledClients(page);
  const cursors: string[] = [];
  await page.route('**/api/v1/clients?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const cursor = query.get('cursor');
    if (!cursor) {
      await route.continue();
      return;
    }
    expect(query.get('q')).toBe('النور');
    expect(query.get('contact')).toBe('all');
    expect(query.get('status')).toBe('active');
    cursors.push(cursor);
    if (cursors.length === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.getByRole('button', { name: 'عرض المزيد', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش قادرين نتصل',
  );
  await expect(page.locator('.client-list > li')).toHaveCount(25);
  await expect(
    page.getByRole('button', { name: 'عرض المزيد', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'إعادة المحاولة', exact: true })
    .click();
  await expect(page.locator('.client-list > li')).toHaveCount(28);
  expect(cursors).toHaveLength(2);
  expect(cursors[0]).toBe(cursors[1]);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'عرض المزيد', exact: true }),
  ).toHaveCount(0);
});

async function proposalClient(page: Page) {
  await register(page);
  await openClients(page);
  await newClient(page);
  await page.getByRole('button', { name: 'إضافة العميل', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'التنقل الرئيسي' })
    .getByRole('link', { name: 'عروض الأسعار', exact: true })
    .click();
  await expect(page).toHaveURL('/proposals');
  await page.getByRole('link', { name: 'عرض جديد', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'اكتب عرضك',
  );
}
async function fillDraft(page: Page) {
  await page
    .getByLabel('عنوان العرض', { exact: true })
    .fill('تصميم هوية مطعم ورقة');
  await page
    .locator('.proposal-client-options')
    .getByRole('button', { name: /سارة علي/ })
    .click();
  await page
    .getByLabel('نطاق الشغل')
    .fill('هوية بصرية تجمع الشعار والألوان ودليل استخدام واضح.');
  await page.getByLabel('وصف البند 1', { exact: true }).fill('تصميم الشعار');
  await page.getByLabel('الكمية 1', { exact: true }).fill('3');
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('0.10');
  await page.getByRole('button', { name: 'إضافة بند', exact: true }).click();
  await page
    .getByLabel('وصف البند 2', { exact: true })
    .fill('دليل استخدام الهوية');
  await page.getByLabel('سعر الوحدة 2', { exact: true }).fill('0.20');
  await page
    .getByLabel('الشروط', { exact: false })
    .fill(
      'مدة التنفيذ 10 أيام عمل. جولتان من التعديلات بعد تقديم المقترح الأول.',
    );
}
async function saveDraft(page: Page) {
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page).toHaveURL(/\/proposals\/[a-f0-9]{24}$/u);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'تصميم هوية',
  );
  return (await proposalModel.findOne().orFail())._id.toString();
}

test('proposal drafts persist exact totals, edit items/currency and render real review/list', async ({
  page,
}) => {
  await proposalClient(page);
  await fillDraft(page);
  await page.getByRole('button', { name: 'تغيير العميل', exact: true }).click();
  await page.getByLabel('البحث عن عميل للعرض', { exact: true }).press('Enter');
  await page.getByLabel('البحث عن عميل للعرض', { exact: true }).press('Escape');
  await expect(
    page.getByRole('button', { name: 'تغيير العميل', exact: true }),
  ).toBeFocused();
  await expect(page).toHaveURL('/proposals/new');
  expect(await proposalModel.countDocuments()).toBe(0);
  await expect(page.locator('.proposal-preview-total strong')).toContainText(
    '٠٫٥٠',
  );
  const id = await saveDraft(page);
  const created = await proposalModel.findById(id).orFail();
  expect(created.totalMinor).toBe(50);
  expect(created.items.map((item) => item.totalMinor)).toEqual([30, 20]);
  expect(created.client.email).toBe('sara@example.com');
  await expect(page.locator('.proposal-final-total')).toContainText('٠٫٥٠');
  await expect(page.getByRole('table')).toContainText('تصميم الشعار');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'تصميم هوية',
  );
  await page.getByRole('link', { name: 'تعديل المسودة' }).click();
  await expect(page.getByLabel('سعر الوحدة 1', { exact: true })).toHaveValue(
    '0.10',
  );
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('1250.50');
  await page.getByLabel('سعر الوحدة 2', { exact: true }).fill('600');
  await selectOption(page.getByRole('combobox', { name: 'عملة العرض' }), 'USD');
  await page.getByRole('button', { name: 'إضافة بند', exact: true }).click();
  await expect(page.getByLabel('وصف البند 3', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'حذف البند 3', exact: true }).click();
  await page.getByLabel('عنوان العرض', { exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/proposal-editor-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await saveDraft(page);
  const updated = await proposalModel.findById(id).orFail();
  expect(updated).toMatchObject({
    version: 2,
    currency: 'USD',
    totalMinor: 435150,
    itemCount: 2,
  });
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/proposal-review-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'كل العروض', exact: true }).click();
  await expect(page.locator('.proposal-row')).toHaveCount(1);
  await expect(page.locator('.proposal-row')).toContainText('سارة علي');
  await expect(page.locator('.proposal-row')).toContainText('٤٬٣٥١٫٥٠');
});

test('proposal client picker pages and searches active clients with cancelled stale responses', async ({
  page,
}) => {
  await register(page);
  await seedSearchClients();
  await page.goto('/proposals/new');
  await expect(page.locator('.proposal-client-options li')).toHaveCount(25);
  await page.getByRole('button', { name: 'عملاء أكتر', exact: true }).click();
  await expect(page.locator('.proposal-client-options li')).toHaveCount(30);
  await expect(page.locator('.proposal-client-options')).not.toContainText(
    'سارة المؤرشفة',
  );
  const search = page.getByLabel('البحث عن عميل للعرض', { exact: true });
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolveHeld) => {
    release = resolveHeld;
  });
  let started: () => void = () => undefined;
  const seen = new Promise<void>((resolveSeen) => {
    started = resolveSeen;
  });
  await page.route('**/api/v1/clients?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === 'عميل 00') {
      const response = await route.fetch();
      started();
      await held;
      await route.fulfill({ response }).catch(() => undefined);
    } else await route.continue();
  });
  await search.fill('عميل 00');
  await seen;
  await search.fill('ورشة سارة');
  await expect(page.locator('.proposal-client-options li')).toHaveCount(1);
  await page
    .locator('.proposal-client-options')
    .getByRole('button', { name: /سارة علي/ })
    .click();
  release();
  await page.unroute('**/api/v1/clients?**');
  await expect(page.locator('.proposal-selected-client')).toContainText(
    'سارة علي',
  );
  await expect(page.locator('#proposal-client-choices')).toBeHidden();
  await expect(page.locator('.proposal-client-options')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'تغيير العميل', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'تغيير العميل', exact: true }).click();
  await search.fill('مفيش اسم كده');
  await expect(
    page.getByText('مفيش عملاء مطابقين.', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.proposal-selected-client')).toContainText(
    'سارة علي',
  );
});

test('proposal edit conflicts preserve input, reload latest, retain archived client and lock sent drafts', async ({
  page,
}) => {
  await proposalClient(page);
  await fillDraft(page);
  const id = await saveDraft(page);
  await page.getByRole('link', { name: 'تعديل المسودة' }).click();
  await page
    .getByLabel('عنوان العرض', { exact: true })
    .fill('تعديل لسه ما اتحفظش');
  await proposalModel.updateOne(
    { _id: id },
    { $set: { title: 'آخر نسخة من الاتفاق' }, $inc: { version: 1 } },
  );
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'العرض اتعدل',
  );
  await expect(page.getByLabel('عنوان العرض', { exact: true })).toHaveValue(
    'تعديل لسه ما اتحفظش',
  );
  const confirmation1 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page.getByRole('button', { name: 'تحميل آخر نسخة' }).click();
  await confirmation1;
  await expect(page.getByLabel('عنوان العرض', { exact: true })).toHaveValue(
    'آخر نسخة من الاتفاق',
  );
  await clientModel.updateOne(
    {},
    { $set: { archivedAt: new Date() }, $inc: { version: 1 } },
  );
  await page
    .getByLabel('عنوان العرض', { exact: true })
    .fill('تصميم هوية بعد مراجعة الاتفاق');
  await saveDraft(page);
  expect((await proposalModel.findById(id).orFail()).version).toBe(3);
  await proposalModel.updateOne({ _id: id }, { $set: { status: 'sent' } });
  await page.goto('/proposals/' + id + '/edit');
  await expect(
    page.getByRole('heading', { name: 'العرض للقراءة فقط' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'حفظ المسودة', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'راجع العرض' }).click();
  await expect(page.getByRole('link', { name: 'تعديل المسودة' })).toHaveCount(
    0,
  );
});

test('proposal uncertain create is blocked from retry and recovers the committed draft', async ({
  page,
}) => {
  await proposalClient(page);
  await fillDraft(page);
  let writes = 0;
  await page.route('**/api/v1/proposals', async (route) => {
    if (route.request().method() === 'POST') {
      writes++;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش قادرين نتأكد',
  );
  await expect(
    page.getByRole('button', { name: 'حفظ المسودة', exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  expect(await proposalModel.countDocuments()).toBe(1);
  await page.unroute('**/api/v1/proposals');
  await page.getByRole('link', { name: 'مراجعة دفتر العروض' }).click();
  await expect(page.locator('.proposal-row')).toHaveCount(1);
  await page.locator('.proposal-row').click();
  await expect(page.locator('.proposal-final-total')).toContainText('٠٫٥٠');
});

test('proposal double submit and expired access refresh commit exactly one draft', async ({
  page,
}) => {
  await proposalClient(page);
  await fillDraft(page);
  now = new Date(now.getTime() + 16 * 60 * 1000);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolveHeld) => {
    release = resolveHeld;
  });
  let writes = 0;
  let refreshes = 0;
  await page.route('**/api/v1/auth/refresh', async (route) => {
    refreshes++;
    await route.continue();
  });
  await page.route('**/api/v1/proposals', async (route) => {
    if (route.request().method() === 'POST') {
      writes++;
      await held;
    }
    await route.continue();
  });
  await page.locator('.proposal-editor').evaluate((form) => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  await expect(
    page.getByRole('button', { name: 'بنحفظ المسودة…', exact: true }),
  ).toBeDisabled();
  release();
  await expect(page).toHaveURL(/\/proposals\/[a-f0-9]{24}$/u);
  await expect(page.locator('.proposal-final-total')).toContainText('٠٫٥٠');
  expect(writes).toBe(2);
  expect(refreshes).toBe(1);
  expect(await proposalModel.countDocuments()).toBe(1);
});

test('proposal drafts stay isolated across logout and another workspace login', async ({
  page,
}) => {
  await proposalClient(page);
  await fillDraft(page);
  const id = await saveDraft(page);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await registerAccount.execute({
    ...account,
    email: 'second-proposal@example.com',
    workspaceName: 'مساحة أخرى',
  });
  await page
    .getByLabel('البريد الإلكتروني')
    .fill('second-proposal@example.com');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'دخول لمساحتك' }).click();
  await expect(page).toHaveURL('/dashboard');
  await page.goto('/proposals');
  await expect(
    page.getByRole('heading', { name: 'أول اتفاق، يبدأ بورقة.' }),
  ).toBeVisible();
  await expect(page.locator('.proposal-row')).toHaveCount(0);
  await page.goto('/proposals/' + id);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'العرض مش موجود في مساحتك',
  );
  await page.goto('/proposals/new');
  await expect(
    page.getByText('مفيش عملاء مطابقين.', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.proposal-client-options')).not.toContainText(
    'سارة علي',
  );
});

test('proposal mobile validation, exact price limits, cancellation and reduced motion', async ({
  page,
}) => {
  await proposalClient(page);
  await fillDraft(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.proposal-selected-client')).toHaveCSS(
    'animation-name',
    'none',
  );
  await page.getByRole('button', { name: 'إضافة بند', exact: true }).click();
  await expect(page.getByLabel('وصف البند 3', { exact: true })).toBeFocused();
  await expect(page.locator('.proposal-item').last()).toHaveCSS(
    'animation-name',
    'none',
  );
  await page.getByRole('button', { name: 'حذف البند 3', exact: true }).click();
  await page.getByRole('button', { name: 'تغيير العميل', exact: true }).click();
  await expect(page.locator('#proposal-client-choices')).toHaveCSS(
    'animation-name',
    'none',
  );
  await page.getByLabel('البحث عن عميل للعرض', { exact: true }).press('Escape');
  await expect(
    page.getByRole('button', { name: 'تغيير العميل', exact: true }),
  ).toBeFocused();
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('0.001');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page.locator('#item-price-error-0')).toBeVisible();
  await expect(page.getByLabel('سعر الوحدة 1', { exact: true })).toBeFocused();
  expect(await proposalModel.countDocuments()).toBe(0);
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('1000000000');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(
    page.getByText('راجع الأسعار والكميات.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('1250.50');
  await page.getByLabel('سعر الوحدة 2', { exact: true }).fill('600');
  await expect(page.locator('.proposal-preview-total strong')).toContainText(
    '٤٬٣٥١٫٥٠',
  );
  await expect(
    page.getByText('راجع الأسعار والكميات.', { exact: false }),
  ).toHaveCount(0);
  await page.getByLabel('عنوان العرض', { exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/proposal-editor-mobile.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator('.proposal-paper')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  const confirmation2 = respondToAppConfirmation(page, (dialog) =>
    dialog.dismiss(),
  );
  await page.getByRole('link', { name: 'إلغاء والرجوع' }).click();
  await confirmation2;
  await expect(page).toHaveURL('/proposals/new');
  const confirmation3 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page.getByRole('link', { name: 'إلغاء والرجوع' }).click();
  await confirmation3;
  await expect(page).toHaveURL('/proposals');
  expect(await proposalModel.countDocuments()).toBe(0);
});

test('proposal list paginates once, preserves loaded rows on page failure and explicitly retries', async ({
  page,
}) => {
  await proposalClient(page);
  await fillDraft(page);
  const id = await saveDraft(page);
  const source = await proposalModel.findById(id).orFail();
  await proposalModel.insertMany(
    Array.from({ length: 27 }, (_, index) => ({
      workspace: source.workspace,
      client: source.client,
      title: 'عرض استوديو ' + index,
      summary: '',
      terms: '',
      currency: 'EGP',
      items: source.items,
      totalMinor: 50,
      itemCount: 2,
    })),
  );
  let failFirst = true;
  let failedNext = false;
  await page.route('**/api/v1/proposals**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/v1/proposals') {
      await route.continue();
      return;
    }
    if (!url.searchParams.has('cursor') && failFirst) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVER_ERROR' } }),
      });
    } else if (url.searchParams.has('cursor') && !failedNext) {
      failedNext = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('link', { name: 'كل العروض', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  failFirst = false;
  await page
    .getByRole('button', { name: 'إعادة المحاولة', exact: true })
    .click();
  await expect(page.locator('.proposal-row')).toHaveCount(25);
  await page.getByRole('button', { name: 'عروض أكتر', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('.proposal-row')).toHaveCount(25);
  await page
    .getByRole('button', { name: 'إعادة المحاولة', exact: true })
    .click();
  await expect(page.locator('.proposal-row')).toHaveCount(28);
  await expect(
    page.getByRole('button', { name: 'عروض أكتر', exact: true }),
  ).toHaveCount(0);
  const hrefs = await page
    .locator('.proposal-row')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(new Set(hrefs).size).toBe(28);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/proposals-list-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
});

async function reviewedDraft(page: Page) {
  await proposalClient(page);
  await fillDraft(page);
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('1250.50');
  await page.getByLabel('سعر الوحدة 2', { exact: true }).fill('600');
  return saveDraft(page);
}
async function createSharingLink(page: Page) {
  await page
    .getByLabel('راجعت العرض وجاهز للمشاركة.', { exact: false })
    .check();
  await page
    .getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true })
    .click();
  await expect(page.getByLabel('رابط العميل', { exact: true })).toBeVisible();
  return page.getByLabel('رابط العميل', { exact: true }).inputValue();
}
test('sharing freezes reviewed content, copies a fragment link and exposes an anonymous allowlisted document', async ({
  page,
  browser,
  context,
}) => {
  const id = await reviewedDraft(page);
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true }),
  ).toBeDisabled();
  await selectOption(
    page.getByRole('combobox', { name: 'صلاحية الرابط', ...{ exact: true } }),
    '14',
  );
  const link = await createSharingLink(page);
  const parsed = new URL(link);
  expect(parsed.pathname).toBe('/share/proposal');
  expect(parsed.search).toBe('');
  expect(parsed.hash).toMatch(/^#[A-Za-z0-9_-]{43}$/u);
  await expect(page.getByRole('link', { name: 'تعديل المسودة' })).toHaveCount(
    0,
  );
  const stored = await proposalModel.findById(id).orFail();
  expect(stored.status).toBe('sent');
  expect(stored.version).toBe(2);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'نسخ الرابط', exact: true }).click();
  await expect(
    page.getByText('الرابط اتنسخ. جاهز تبعته للعميل.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/proposal-sharing-desktop.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/proposal-sharing-mobile.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const viewerContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    const authCalls: string[] = [];
    const publicCalls: {
      cookie: string | undefined;
      authorization: string | undefined;
      url: string;
    }[] = [];
    viewer.on('request', (request) => {
      if (request.url().includes('/api/v1/auth/'))
        authCalls.push(request.url());
      if (request.url().includes('/api/v1/public/proposals/read'))
        publicCalls.push({
          cookie: request.headers().cookie,
          authorization: request.headers().authorization,
          url: request.url(),
        });
    });
    const response = await viewer.goto(link);
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'تصميم هوية مطعم ورقة',
    );
    await expect(viewer.getByRole('table')).toContainText(
      'دليل استخدام الهوية',
    );
    await expect(viewer.locator('.proposal-final-total')).toContainText(
      '٤٬٣٥١٫٥٠',
    );
    await expect(viewer.locator('.proposal-sender')).toContainText(
      account.workspaceName,
    );
    await expect(viewer.getByRole('navigation')).toHaveCount(0);
    await expect(viewer.getByRole('main')).not.toContainText(
      'sara@example.com',
    );
    await expect(viewer.getByRole('main')).not.toContainText('+20 100');
    await expect(viewer.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/u,
    );
    await viewer.screenshot({
      path: resolve(
        import.meta.dirname,
        '../../../.cache/ui/public-proposal-desktop.png',
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await viewerContext.addCookies(await context.cookies());
    await viewerContext.addCookies([
      {
        name: 'public_probe',
        value: 'must-not-send',
        domain: 'localhost',
        path: '/',
      },
    ]);
    await viewer.reload();
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'تصميم هوية مطعم ورقة',
    );
    expect(authCalls).toHaveLength(0);
    expect(publicCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of publicCalls) {
      expect(call.cookie).toBeUndefined();
      expect(call.authorization).toBeUndefined();
      expect(call.url).not.toContain(parsed.hash.slice(1));
    }
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'تجديد رابط المشاركة', exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel('رابط العميل', { exact: true })).toHaveCount(
      0,
    );
    const confirmation4 = respondToAppConfirmation(page, (dialog) =>
      dialog.accept(),
    );
    await page
      .getByRole('button', { name: 'تجديد رابط المشاركة', exact: true })
      .click();
    await confirmation4;
    await expect(page.getByLabel('رابط العميل', { exact: true })).toBeVisible();
    const renewed = await page
      .getByLabel('رابط العميل', { exact: true })
      .inputValue();
    expect(renewed).not.toBe(link);
    await viewer.goto(link);
    await viewer.reload();
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'الرابط غير متاح',
    );
    await viewer.goto(renewed);
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'تصميم هوية مطعم ورقة',
    );
    const confirmation5 = respondToAppConfirmation(page, (dialog) =>
      dialog.accept(),
    );
    await page
      .getByRole('button', { name: 'إلغاء الرابط', exact: true })
      .click();
    await confirmation5;
    await expect(page.getByText('الرابط ملغي', { exact: true })).toBeVisible();
    await expect(page.getByLabel('رابط العميل', { exact: true })).toHaveCount(
      0,
    );
    await viewer.reload();
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'الرابط غير متاح',
    );
  } finally {
    await viewerContext.close();
  }
});
test('public proposal mobile reduced motion, missing links and deadline expiry clear previously loaded content', async ({
  page,
  browser,
}) => {
  await reviewedDraft(page);
  await selectOption(
    page.getByRole('combobox', { name: 'صلاحية الرابط', ...{ exact: true } }),
    '1',
  );
  const link = await createSharingLink(page);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined });
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined });
  });
  try {
    const viewer = await context.newPage();
    await viewer.clock.install();
    await viewer.goto(link);
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'تصميم هوية مطعم ورقة',
    );
    await expect(viewer.locator('.proposal-review')).toHaveCSS(
      'animation-name',
      'none',
    );
    expect(
      await viewer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await viewer.screenshot({
      path: resolve(
        import.meta.dirname,
        '../../../.cache/ui/public-proposal-mobile.png',
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await viewer.getByRole('link', { name: 'انتقل للمحتوى' }).focus();
    await viewer.keyboard.press('Enter');
    await expect(viewer.getByRole('main')).toBeFocused();
    expect(viewer.url()).toBe(link);
    shareNow = new Date(shareNow.getTime() + 86_400_000);
    await viewer.clock.fastForward(86_400_000);
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'الرابط غير متاح',
    );
    await expect(viewer.getByRole('table')).toHaveCount(0);
    await viewer.goto('http://localhost:3100/share/proposal');
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'الرابط غير متاح',
    );
    await viewer.getByRole('link', { name: 'انتقل للمحتوى' }).focus();
    await viewer.keyboard.press('Enter');
    await expect(viewer.getByRole('main')).toBeVisible();
  } finally {
    await context.close();
  }
});
test('sharing and revocation lost responses block repeat writes and recover through explicit state reload', async ({
  page,
}) => {
  const id = await reviewedDraft(page);
  let creates = 0;
  await page.route('**/api/v1/proposals/' + id + '/share', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    creates++;
    await route.fetch();
    await route.abort('failed');
  });
  await page
    .getByLabel('راجعت العرض وجاهز للمشاركة.', { exact: false })
    .check();
  await page
    .getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش قادرين نتأكد',
  );
  expect(creates).toBe(1);
  expect((await proposalModel.findById(id).orFail()).version).toBe(2);
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/api/v1/proposals/' + id + '/share');
  await page
    .getByRole('button', { name: 'تحديث العرض وحالة الرابط', exact: true })
    .click();
  await expect(page.getByText('الرابط شغال', { exact: true })).toBeVisible();
  const confirmation6 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'تجديد رابط المشاركة', exact: true })
    .click();
  await confirmation6;
  await expect(page.getByLabel('رابط العميل', { exact: true })).toBeVisible();
  let revokes = 0;
  await page.route(
    '**/api/v1/proposals/' + id + '/share/revoke',
    async (route) => {
      revokes++;
      await route.fetch();
      await route.abort('failed');
    },
  );
  const confirmation7 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page.getByRole('button', { name: 'إلغاء الرابط', exact: true }).click();
  await confirmation7;
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش قادرين نتأكد',
  );
  expect(revokes).toBe(1);
  expect((await proposalModel.findById(id).orFail()).version).toBe(4);
  await expect(
    page.getByRole('button', { name: 'إلغاء الرابط', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('رابط العميل', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/proposals/' + id + '/share/revoke');
  await page
    .getByRole('button', { name: 'تحديث العرض وحالة الرابط', exact: true })
    .click();
  await expect(page.getByText('الرابط ملغي', { exact: true })).toBeVisible();
});
test('a stale review cannot share a newer unseen draft and explicit reload requires reviewing the updated content', async ({
  page,
}) => {
  const id = await reviewedDraft(page);
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true }),
  ).toBeDisabled();
  const record = await proposalModel.findById(id).orFail();
  await proposals.update(record.workspace.toString(), id, 1, {
    clientId: record.client.id.toString(),
    title: 'عرض محدث للمراجعة',
    summary: record.summary,
    terms: record.terms,
    currency: record.currency,
    items: record.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unitPrice: (item.unitPriceMinor / 100).toFixed(2),
    })),
  });
  await page
    .getByLabel('راجعت العرض وجاهز للمشاركة.', { exact: false })
    .check();
  await page
    .getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'العرض اتعدل من مكان تاني',
  );
  expect((await proposalModel.findById(id).orFail()).share).toBeNull();
  await page
    .getByRole('button', { name: 'تحديث العرض وحالة الرابط', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'عرض محدث للمراجعة',
  );
  await expect(
    page.getByLabel('راجعت العرض وجاهز للمشاركة.', { exact: false }),
  ).not.toBeChecked();
  await createSharingLink(page);
  expect((await proposalModel.findById(id).orFail()).version).toBe(3);
});
test('public read failures retry explicitly and a changed fragment cancels late confidential content', async ({
  page,
  browser,
}) => {
  await reviewedDraft(page);
  const link = await createSharingLink(page);
  const context = await browser.newContext();
  try {
    const viewer = await context.newPage();
    let attempts = 0;
    let allow = false;
    await viewer.route('**/api/v1/public/proposals/read', async (route) => {
      attempts++;
      if (!allow) await route.abort('failed');
      else await route.continue();
    });
    await viewer.goto(link);
    await expect(viewer.getByRole('main').getByRole('alert')).toContainText(
      'راجع اتصالك',
    );
    expect(attempts).toBeGreaterThanOrEqual(1);
    allow = true;
    await viewer
      .getByRole('button', { name: 'إعادة المحاولة', exact: true })
      .click();
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'تصميم هوية مطعم ورقة',
    );
    await viewer.unroute('**/api/v1/public/proposals/read');
    let release!: () => void;
    const hold = new Promise<void>((resolveHold) => {
      release = resolveHold;
    });
    let arrived!: () => void;
    const started = new Promise<void>((resolveStarted) => {
      arrived = resolveStarted;
    });
    await viewer.route('**/api/v1/public/proposals/read', async (route) => {
      if (
        route.request().postDataJSON().token !== new URL(link).hash.slice(1)
      ) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      arrived();
      await hold;
      await route.fulfill({ response }).catch(() => undefined);
    });
    const navigation = viewer.reload();
    await started;
    await viewer.evaluate(() => {
      window.location.hash = 'x'.repeat(43);
    });
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'الرابط غير متاح',
    );
    release();
    await navigation;
    await expect(viewer.getByRole('table')).toHaveCount(0);
    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(
      'الرابط غير متاح',
    );
  } finally {
    await context.close();
  }
});

test('client acceptance requires confirmation, prevents duplicate submit and opens the exact accepted project', async ({
  page,
  browser,
}) => {
  const id = await reviewedDraft(page);
  const link = await createSharingLink(page);
  const viewerContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    const decisions: {
      cookie: string | undefined;
      authorization: string | undefined;
      requestId: string;
    }[] = [];
    viewer.on('request', (request) => {
      if (request.url().endsWith('/public/proposals/decide'))
        decisions.push({
          cookie: request.headers().cookie,
          authorization: request.headers().authorization,
          requestId: request.postDataJSON().requestId,
        });
    });
    await viewer.goto(link);
    await viewer
      .getByRole('button', { name: 'قبول العرض', exact: true })
      .click();
    const confirm = viewer.getByRole('button', {
      name: 'تأكيد قبول العرض',
      exact: true,
    });
    await expect(confirm).toBeFocused();
    expect((await proposalModel.findById(id).orFail()).status).toBe('sent');
    await viewer.getByRole('button', { name: 'الرجوع للمراجعة' }).click();
    await expect(
      viewer.getByRole('button', { name: 'قبول العرض', exact: true }),
    ).toBeFocused();
    await viewer
      .getByRole('button', { name: 'قبول العرض', exact: true })
      .click();
    await viewer.evaluate(() => window.scrollTo(0, 0));
    await viewer.screenshot({
      path: resolve(
        import.meta.dirname,
        '../../../.cache/ui/proposal-confirmation-desktop.png',
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await confirm.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(
      viewer.getByRole('heading', { name: 'تم قبول العرض', exact: true }),
    ).toBeVisible();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.cookie).toBeUndefined();
    expect(decisions[0]?.authorization).toBeUndefined();
    expect(await projectModel.countDocuments()).toBe(1);
    await viewer.reload();
    await expect(
      viewer.getByRole('heading', { name: 'تم قبول العرض', exact: true }),
    ).toBeVisible();
    await expect(
      viewer.getByRole('button', { name: 'قبول العرض', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'تحديث حالة العرض', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'افتح المشروع', exact: true }),
    ).toBeVisible();
    const stored = await proposalModel.findById(id).orFail();
    const project = await projectModel
      .findById(stored.decision?.project)
      .orFail();
    await page.getByRole('link', { name: 'افتح المشروع', exact: true }).click();
    await expect(page).toHaveURL('/projects/' + project.id);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'تصميم هوية مطعم ورقة',
    );
    await expect(page.locator('.proposal-final-total')).toContainText(
      '٤٬٣٥١٫٥٠',
    );
    await expect(
      page.getByRole('link', { name: 'عرض الاتفاق', exact: true }),
    ).toHaveAttribute('href', '/proposals/' + id);
    expect(project.totalMinor).toBe(stored.totalMinor);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        '../../../.cache/ui/accepted-project-desktop.png',
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        '../../../.cache/ui/accepted-project-mobile.png',
      ),
      fullPage: true,
      animations: 'disabled',
    });
  } finally {
    await viewerContext.close();
  }
});

test('client rejection works on mobile with reduced motion and creates no project', async ({
  page,
}) => {
  const id = await reviewedDraft(page);
  const link = await createSharingLink(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(link);
  await page.getByRole('button', { name: 'رفض العرض', exact: true }).click();
  const confirm = page.getByRole('button', {
    name: 'تأكيد رفض العرض',
    exact: true,
  });
  await expect(confirm).toBeFocused();
  expect(
    await page
      .locator('.proposal-response-confirm')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/proposal-confirmation-mobile.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
  await confirm.click();
  await expect(
    page.getByRole('heading', { name: 'تم رفض العرض', exact: true }),
  ).toBeVisible();
  expect(await projectModel.countDocuments()).toBe(0);
  expect((await proposalModel.findById(id).orFail()).status).toBe('rejected');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'تم رفض العرض', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
});

test('lost acceptance response blocks another write and explicit review recovers the committed decision', async ({
  page,
}) => {
  await reviewedDraft(page);
  const link = await createSharingLink(page);
  await page.goto(link);
  let writes = 0;
  await page.route('**/public/proposals/decide', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'قبول العرض', exact: true }).click();
  await page
    .getByRole('button', { name: 'تأكيد قبول العرض', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش قادرين نتأكد',
  );
  await expect(
    page.getByRole('button', { name: 'تأكيد قبول العرض', exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
  expect(await projectModel.countDocuments()).toBe(1);
  await page
    .getByRole('button', { name: 'مراجعة حالة العرض', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'تم قبول العرض', exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  expect(await projectModel.countDocuments()).toBe(1);
});

test('failed connection before commit requires a read and keeps the original decision attempt for explicit retry', async ({
  page,
}) => {
  await reviewedDraft(page);
  const link = await createSharingLink(page);
  await page.goto(link);
  const keys: string[] = [];
  let first = true;
  await page.route('**/public/proposals/decide', async (route) => {
    keys.push(route.request().postDataJSON().requestId);
    if (first) {
      first = false;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'قبول العرض', exact: true }).click();
  await page
    .getByRole('button', { name: 'تأكيد قبول العرض', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش قادرين نتأكد',
  );
  expect(await projectModel.countDocuments()).toBe(0);
  await page
    .getByRole('button', { name: 'مراجعة حالة العرض', exact: true })
    .click();
  const confirm = page.getByRole('button', {
    name: 'تأكيد قبول العرض',
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'رفض العرض', exact: true }),
  ).toHaveCount(0);
  await confirm.click();
  await expect(
    page.getByRole('heading', { name: 'تم قبول العرض', exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(await projectModel.countDocuments()).toBe(1);
});

test('a stale viewer cannot override a decision and explicit review shows the winning outcome', async ({
  page,
}) => {
  await reviewedDraft(page);
  const link = await createSharingLink(page);
  await page.goto(link);
  const other = await page.context().newPage();
  try {
    await other.goto(link);
    await other.getByRole('button', { name: 'رفض العرض', exact: true }).click();
    await page.getByRole('button', { name: 'قبول العرض', exact: true }).click();
    await page
      .getByRole('button', { name: 'تأكيد قبول العرض', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'تم قبول العرض', exact: true }),
    ).toBeVisible();
    await other
      .getByRole('button', { name: 'تأكيد رفض العرض', exact: true })
      .click();
    await expect(other.getByRole('main').getByRole('alert')).toContainText(
      'قرار اتسجل',
    );
    await other
      .getByRole('button', { name: 'مراجعة حالة العرض', exact: true })
      .click();
    await expect(
      other.getByRole('heading', { name: 'تم قبول العرض', exact: true }),
    ).toBeVisible();
    expect(await projectModel.countDocuments()).toBe(1);
  } finally {
    await other.close();
  }
});

test('revocation between review and confirmation prevents a decision and clears the public document on recheck', async ({
  page,
  browser,
}) => {
  const id = await reviewedDraft(page);
  const link = await createSharingLink(page);
  const viewerContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    await viewer.goto(link);
    await viewer
      .getByRole('button', { name: 'قبول العرض', exact: true })
      .click();
    const confirmation8 = respondToAppConfirmation(page, (dialog) =>
      dialog.accept(),
    );
    await page
      .getByRole('button', { name: 'إلغاء الرابط', exact: true })
      .click();
    await confirmation8;
    await expect(page.locator('.proposal-share-state')).toContainText(
      'الرابط ملغي',
    );
    await viewer
      .getByRole('button', { name: 'تأكيد قبول العرض', exact: true })
      .click();
    await expect(viewer.getByRole('main').getByRole('alert')).toContainText(
      'الرابط مش متاح',
    );
    await viewer
      .getByRole('button', { name: 'مراجعة حالة العرض', exact: true })
      .click();
    await expect(
      viewer.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
    ).toBeVisible();
    await expect(viewer.getByRole('table')).toHaveCount(0);
    expect((await proposalModel.findById(id).orFail()).status).toBe('sent');
    expect(await projectModel.countDocuments()).toBe(0);
  } finally {
    await viewerContext.close();
  }
});

test('legacy sharing stays read-only and renewal explicitly upgrades response permission', async ({
  page,
  browser,
}) => {
  const id = await reviewedDraft(page);
  const link = await createSharingLink(page);
  await proposalModel.updateOne(
    { _id: id },
    { $unset: { 'share.allowResponse': '' } },
  );
  await page.reload();
  await expect(
    page.getByText('الرابط الحالي للقراءة فقط. تجديده هيسمح بالقبول والرفض.', {
      exact: true,
    }),
  ).toBeVisible();
  const viewerContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    await viewer.goto(link);
    await expect(viewer.getByRole('table')).toBeVisible();
    await expect(
      viewer.getByRole('button', { name: 'قبول العرض', exact: true }),
    ).toHaveCount(0);
    const confirmation9 = respondToAppConfirmation(page, async (dialog) => {
      expect(dialog.message()).toContain('يسمح بقبول أو رفض');
      await dialog.accept();
    });
    await page
      .getByRole('button', { name: 'تجديد رابط المشاركة', exact: true })
      .click();
    await confirmation9;
    const renewed = await page
      .getByLabel('رابط العميل', { exact: true })
      .inputValue();
    expect(renewed).not.toBe(link);
    await viewer.reload();
    await expect(
      viewer.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
    ).toBeVisible();
    await viewer.goto(renewed);
    await expect(
      viewer.getByRole('button', { name: 'قبول العرض', exact: true }),
    ).toBeVisible();
    expect(await projectModel.countDocuments()).toBe(0);
  } finally {
    await viewerContext.close();
  }
});

async function seedManualClient(page: Page) {
  await register(page);
  const workspace = await models.Workspace.findOne().orFail();
  return clients.create(workspace.id, {
    name: 'سارة علي',
    company: 'استوديو سارة',
    email: 'sara@example.com',
    phone: '+20 100 555 4444',
    notes: '',
  });
}
async function fillManualProject(page: Page, title = 'مشروع الهوية الجديدة') {
  await page.goto('/projects/new');
  await page.getByLabel('اسم المشروع', { exact: true }).fill(title);
  await page.locator('.proposal-client-options button').first().click();
  await page
    .getByLabel('وصف المشروع', { exact: false })
    .fill('نطاق شغل واضح، وبيانات العميل محفوظة مع البداية.');
}
async function createManualInBrowser(page: Page) {
  await seedManualClient(page);
  await fillManualProject(page);
  await page
    .getByRole('button', { name: 'إنشاء المشروع', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp('/projects/[a-f0-9]{24}$', 'u'));
  return page.url().split('/').at(-1)!;
}
async function chooseProjectStatus(page: Page, status: string) {
  await selectOption(
    page.getByRole('combobox', { name: 'الحالة الجديدة', ...{ exact: true } }),
    status,
  );
  await page
    .getByRole('button', { name: 'تحديث حالة المشروع', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'تأكيد الحالة', exact: true }),
  ).toBeFocused();
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(
    'responsive audit PRJ-001 manual projects, filtering and confirmed lifecycle ' +
      viewport.width,
    async ({ page }) => {
      test.setTimeout(90000);
      const title =
        viewport.width === 320
          ? 'BrandIdentity'.repeat(9)
          : 'مشروع الهوية الجديدة';
      const layout = async (screen: string) =>
        expect(
          (
            await inspectResponsiveLayout(
              page,
              screen,
              viewport.width <= 960,
              viewport.width,
            )
          ).issues,
          screen,
        ).toEqual([]);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      await seedManualClient(page);
      await page.goto('/projects');
      await expect(
        page.getByRole('heading', {
          name: 'مكان الشغل اللي اتفقنا عليه.',
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'مشروع جديد', exact: true }).click();
      await page
        .getByRole('button', { name: 'إنشاء المشروع', exact: true })
        .click();
      await expect(page.locator('.field-error').first()).toBeVisible();
      await layout('project-create-validation');
      await page.getByLabel('اسم المشروع', { exact: true }).fill(title);
      await page.locator('.proposal-client-options button').first().click();
      await page
        .getByLabel('وصف المشروع', { exact: false })
        .fill(
          viewport.width === 320
            ? 'مرجع الشغل https://example.com/' + 'a'.repeat(900)
            : 'تنفيذ الهوية ومراجعتها مع العميل.',
        );
      await page
        .getByRole('button', { name: 'إنشاء المشروع', exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: title,
          exact: true,
        }),
      ).toBeVisible();
      await layout('project-active');
      const id = page.url().split('/').at(-1)!;
      await expect(page.getByRole('table')).toHaveCount(0);
      await expect(page.locator('.project-manual')).toContainText(
        'sara@example.com',
      );
      await page.screenshot({
        path: resolve(
          import.meta.dirname,
          '../../../.cache/ui/project-manual-' + viewport.width + '.png',
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await chooseProjectStatus(page, 'on_hold');
      await layout('project-confirmation');
      if (viewport.width === 320)
        expect(
          await page
            .locator('.project-status-confirm')
            .evaluate((element) => getComputedStyle(element).animationName),
        ).toBe('none');
      await page.getByRole('button', { name: 'رجوع', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'تحديث حالة المشروع', exact: true }),
      ).toBeFocused();
      expect((await projectModel.findById(id).orFail()).version).toBe(1);
      await chooseProjectStatus(page, 'on_hold');
      await page
        .getByRole('button', { name: 'تأكيد الحالة', exact: true })
        .click();
      await expect(
        page.locator('.project-status-panel .project-status'),
      ).toHaveText('متوقف مؤقتًا');
      await page
        .getByRole('link', { name: 'كل المشاريع', exact: true })
        .click();
      await selectOption(
        page.getByRole('combobox', {
          name: 'حالة المشاريع',
          ...{ exact: false },
        }),
        'active',
      );
      await expect(
        page.getByRole('heading', {
          name: 'مفيش مشاريع بالحالة دي.',
          exact: true,
        }),
      ).toBeVisible();
      await selectOption(
        page.getByRole('combobox', {
          name: 'حالة المشاريع',
          ...{ exact: false },
        }),
        'on_hold',
      );
      await expect(page.locator('.project-row')).toHaveCount(1);
      await layout('project-list');
      await page.screenshot({
        path: resolve(
          import.meta.dirname,
          '../../../.cache/ui/projects-list-' + viewport.width + '.png',
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await page.locator('.project-row').click();
      await chooseProjectStatus(page, 'active');
      await page
        .getByRole('button', { name: 'تأكيد الحالة', exact: true })
        .click();
      await expect(
        page.locator('.project-status-panel .project-status'),
      ).toHaveText('نشط');
      await chooseProjectStatus(page, 'completed');
      await expect(
        page.getByRole('group', { name: 'تأكيد تغيير الحالة' }),
      ).toContainText('نهائية');
      await page
        .getByRole('button', { name: 'تأكيد الحالة', exact: true })
        .click();
      await expect(
        page.locator('.project-status-panel .project-status'),
      ).toHaveText('مكتمل');
      await expect(
        page.getByRole('button', { name: 'تحديث حالة المشروع', exact: true }),
      ).toHaveCount(0);
      expect((await projectModel.findById(id).orFail()).version).toBe(4);
      await layout('project-completed');
      await expect(
        page.getByRole('heading', { name: 'حالة المشروع', exact: true }),
      ).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
      ).toBe(false);
    },
  );
}
test('PRJ-001 lost manual-create response blocks duplicate creation and recovers via list', async ({
  page,
}) => {
  await seedManualClient(page);
  await fillManualProject(page);
  let writes = 0;
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page
    .getByRole('button', { name: 'إنشاء المشروع', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش متأكدين',
  );
  await expect(
    page.getByRole('button', { name: 'إنشاء المشروع', exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  expect(await projectModel.countDocuments()).toBe(1);
  await page
    .getByRole('link', { name: 'مراجعة المشاريع', exact: true })
    .click();
  await expect(page.locator('.project-row')).toHaveCount(1);
});
test('PRJ-001 lost status response requires a read and never replays the write', async ({
  page,
}) => {
  const id = await createManualInBrowser(page);
  let writes = 0;
  await page.route('**/api/v1/projects/*/status', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await chooseProjectStatus(page, 'on_hold');
  await page.getByRole('button', { name: 'تأكيد الحالة', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'نتيجة التغيير مش مؤكدة',
  );
  await expect(
    page.getByRole('button', { name: 'تحديث حالة المشروع', exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  expect((await projectModel.findById(id).orFail()).status).toBe('on_hold');
  await page
    .getByRole('button', { name: 'قراءة الحالة الحالية', exact: true })
    .click();
  await expect(
    page.locator('.project-status-panel .project-status'),
  ).toHaveText('متوقف مؤقتًا');
  expect(writes).toBe(1);
});
test('PRJ-001 stale status change preserves the frozen accepted agreement', async ({
  page,
}) => {
  const proposalId = await reviewedDraft(page);
  const link = await createSharingLink(page);
  await createProposalDecisions(
    database,
    proposalModel,
    projectModel,
    () => shareNow,
  ).execute(link.split('#')[1]!, 'accept', randomUUID());
  const stored = await projectModel.findOne().orFail();
  const before = stored.toObject();
  await page.goto('/projects/' + stored.id);
  await expect(page.getByRole('table')).toBeVisible();
  await createProjects(database, projectModel, clientModel).changeStatus(
    stored.workspace.toString(),
    stored.id,
    1,
    'on_hold',
  );
  await chooseProjectStatus(page, 'completed');
  await page.getByRole('button', { name: 'تأكيد الحالة', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'اتغير في مكان تاني',
  );
  await expect(page.getByRole('table')).toBeVisible();
  await page
    .getByRole('button', { name: 'قراءة الحالة الحالية', exact: true })
    .click();
  await expect(
    page.locator('.project-status-panel .project-status'),
  ).toHaveText('متوقف مؤقتًا');
  await chooseProjectStatus(page, 'cancelled');
  await page.getByRole('button', { name: 'تأكيد الحالة', exact: true }).click();
  await expect(
    page.locator('.project-status-panel .project-status'),
  ).toHaveText('ملغي');
  const after = await projectModel.findById(stored.id).orFail();
  expect(after.toObject().items).toEqual(before.items);
  expect(after.toObject().client).toEqual(before.client);
  expect(after.acceptedAt).toEqual(before.acceptedAt);
  expect((await proposalModel.findById(proposalId).orFail()).status).toBe(
    'accepted',
  );
});
test('PRJ-001 filters reset pagination and page through current projects', async ({
  page,
}) => {
  const client = await seedManualClient(page);
  const workspace = await models.Workspace.findOne().orFail();
  const projects = createProjects(database, projectModel, clientModel);
  for (let index = 0; index < 27; index++)
    await projects.create(workspace.id, {
      clientId: client.id,
      title: 'مشروع ' + index,
      summary: '',
    });
  await page.goto('/projects');
  await expect(page.locator('.project-row')).toHaveCount(25);
  await page.getByRole('button', { name: 'مشاريع أكتر', exact: true }).click();
  await expect(page.locator('.project-row')).toHaveCount(27);
  await selectOption(
    page.getByRole('combobox', { name: 'حالة المشاريع', ...{ exact: false } }),
    'completed',
  );
  await expect(page.locator('.project-row')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'مشاريع أكتر', exact: true }),
  ).toHaveCount(0);
  await selectOption(
    page.getByRole('combobox', { name: 'حالة المشاريع', ...{ exact: false } }),
    'active',
  );
  await expect(page.locator('.project-row')).toHaveCount(25);
});

test('PRJ-001 committed creation stays blocked while details navigation is delayed', async ({
  page,
}) => {
  await seedManualClient(page);
  await fillManualProject(page);
  let writes = 0;
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/api/v1/projects' &&
      request.method() === 'POST'
    )
      writes++;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const navigation = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route(
    (url) =>
      url.origin === 'http://localhost:3100' &&
      new RegExp('^/projects/[a-f0-9]{24}$', 'u').test(url.pathname),
    async (route) => {
      arrived();
      await gate;
      await route.continue();
    },
  );
  try {
    await page
      .getByRole('button', { name: 'إنشاء المشروع', exact: true })
      .click();
    await navigation;
    await expect(
      page.locator('.project-create button[type="submit"]'),
    ).toBeDisabled();
    await page.locator('.project-create').dispatchEvent('submit');
    expect(writes).toBe(1);
    expect(await projectModel.countDocuments()).toBe(1);
  } finally {
    release();
  }
  await expect(page).toHaveURL(new RegExp('/projects/[a-f0-9]{24}$', 'u'));
});
test('PRJ-001 changing filters discards a late response from the previous status', async ({
  page,
}) => {
  const client = await seedManualClient(page);
  const workspace = await models.Workspace.findOne().orFail();
  await createProjects(database, projectModel, clientModel).create(
    workspace.id,
    { clientId: client.id, title: 'مشروع نشط', summary: '' },
  );
  await page.goto('/projects');
  await expect(page.locator('.project-row')).toHaveCount(1);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const requested = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/v1/projects?*', async (route) => {
    if (
      new URL(route.request().url()).searchParams.get('status') !== 'active'
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await selectOption(
      page.getByRole('combobox', {
        name: 'حالة المشاريع',
        ...{ exact: false },
      }),
      'active',
    );
    await requested;
    await selectOption(
      page.getByRole('combobox', {
        name: 'حالة المشاريع',
        ...{ exact: false },
      }),
      'completed',
    );
    await expect(
      page.getByRole('heading', {
        name: 'مفيش مشاريع بالحالة دي.',
        exact: true,
      }),
    ).toBeVisible();
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.locator('.project-row')).toHaveCount(0);
    await expect(
      page.getByRole('combobox', {
        name: 'حالة المشاريع',
        ...{ exact: false },
      }),
    ).toHaveAttribute('value', 'completed');
  } finally {
    release();
  }
});

async function addTaskInBrowser(
  page: Page,
  title: string,
  priority = 'normal',
  description = '',
) {
  await page.getByRole('button', { name: 'مهمة جديدة', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'مهمة جديدة', exact: true });
  await dialog.getByLabel('اسم المهمة', { exact: true }).fill(title);
  await dialog.getByLabel('وصف المهمة', { exact: false }).fill(description);
  await selectOption(
    dialog.getByRole('combobox', { name: 'أولوية المهمة', ...{ exact: true } }),
    priority,
  );
  await dialog
    .getByRole('button', { name: 'إضافة المهمة', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const card = page
    .locator('.task-card')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(card).toBeVisible();
  return (await card.getAttribute('data-task-id'))!;
}
async function moveTaskInBrowser(
  page: Page,
  id: string,
  status: string,
  before = '',
) {
  const card = page.locator('.task-card[data-task-id="' + id + '"]');
  await card.getByRole('button', { name: 'نقل وترتيب', exact: true }).click();
  await expect(
    card.getByRole('combobox', { name: 'نقل المهمة إلى', ...{ exact: true } }),
  ).toBeFocused();
  await selectOption(
    card.getByRole('combobox', { name: 'نقل المهمة إلى', ...{ exact: true } }),
    status,
  );
  await selectOption(
    card.getByRole('combobox', { name: 'مكان المهمة', ...{ exact: true } }),
    before,
  );
  await card.getByRole('button', { name: 'تطبيق النقل', exact: true }).click();
  await expect(
    page.locator(
      '.task-lane[data-task-status="' +
        status +
        '"] .task-card[data-task-id="' +
        id +
        '"]',
    ),
  ).toBeVisible();
  await expect(page.locator('.task-move-controls')).toHaveCount(0);
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(
    'responsive audit TSK-001 task editing, ordering and terminal project ' +
      viewport.width,
    async ({ page }, testInfo) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      const id = await createManualInBrowser(page);
      await expect(
        page.getByRole('button', { name: 'مهمة جديدة', exact: true }),
      ).toBeEnabled();
      const layout = async (screen: string) =>
        expect(
          (
            await inspectResponsiveLayout(
              page,
              screen,
              viewport.width <= 960,
              viewport.width,
            )
          ).issues,
          screen,
        ).toEqual([]);
      await page
        .getByRole('button', { name: 'مهمة جديدة', exact: true })
        .click();
      let dialog = page.getByRole('dialog', {
        name: 'مهمة جديدة',
        exact: true,
      });
      const priority = dialog.getByRole('combobox', {
        name: 'أولوية المهمة',
        exact: true,
      });
      await priority.click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await priority.press('End');
      await priority.press('Escape');
      await expect(dialog).toBeVisible();
      await expect(priority).toBeFocused();
      await expect(priority).toHaveAttribute('value', 'normal');
      await dialog
        .getByRole('button', { name: 'إضافة المهمة', exact: true })
        .click();
      await expect(dialog.locator('.field-error')).toBeVisible();
      await expect(
        dialog.getByLabel('اسم المهمة', { exact: true }),
      ).toBeFocused();
      await layout('task-validation-dialog');
      await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'مهمة جديدة', exact: true }),
      ).toBeFocused();
      const title =
        viewport.width === 320 ? 'BrandIdentity'.repeat(9) : 'مراجعة الهوية';
      const description =
        viewport.width === 320
          ? 'مرجع الشغل https://example.com/' + 'a'.repeat(1200)
          : 'مراجعة الشغل مع العميل.';
      const a = await addTaskInBrowser(page, title, 'high', description),
        b = await addTaskInBrowser(page, 'تصميم الشعار'),
        c = await addTaskInBrowser(page, 'تسليم الملفات', 'low');
      const order = () =>
        page
          .locator('.task-lane[data-task-status="todo"] .task-card')
          .evaluateAll((cards) =>
            cards.map((card) => card.getAttribute('data-task-id')),
          );
      await expect.poll(order).toEqual([a, b, c]);
      await page
        .locator('.task-card[data-task-id="' + c + '"]')
        .getByRole('button', { name: 'طلّع مهمة تسليم الملفات', exact: true })
        .click();
      await expect.poll(order).toEqual([a, c, b]);
      await page.reload();
      await expect.poll(order).toEqual([a, c, b]);
      await layout('task-board-long-content');
      await page
        .locator('.task-card[data-task-id="' + a + '"]')
        .getByRole('button', { name: 'تعديل', exact: true })
        .click();
      dialog = page.getByRole('dialog', { name: 'تعديل المهمة', exact: true });
      await expect(
        dialog.getByLabel('اسم المهمة', { exact: true }),
      ).toHaveValue(title);
      await dialog
        .getByLabel('اسم المهمة', { exact: true })
        .fill('مراجعة نهائية');
      await dialog
        .getByRole('button', { name: 'حفظ المهمة', exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.locator('.task-card[data-task-id="' + a + '"]'),
      ).toContainText('مراجعة نهائية');
      const card = page.locator('.task-card[data-task-id="' + a + '"]');
      await card
        .getByRole('button', { name: 'نقل وترتيب', exact: true })
        .click();
      await layout('task-move-controls');
      if (viewport.width === 320)
        expect(
          await card
            .locator('.task-move-controls')
            .evaluate((element) => getComputedStyle(element).animationName),
        ).toBe('none');
      await card.getByRole('button', { name: 'رجوع', exact: true }).click();
      await expect(
        card.getByRole('button', { name: 'نقل وترتيب', exact: true }),
      ).toBeFocused();
      await moveTaskInBrowser(page, a, 'in_progress');
      await moveTaskInBrowser(page, c, 'done');
      await moveTaskInBrowser(page, a, 'done', c);
      await expect
        .poll(() =>
          page
            .locator('.task-lane[data-task-status="done"] .task-card')
            .evaluateAll((cards) =>
              cards.map((card) => card.getAttribute('data-task-id')),
            ),
        )
        .toEqual([a, c]);
      await page
        .locator('.task-card[data-task-id="' + b + '"]')
        .getByRole('button', { name: 'حذف', exact: true })
        .click();
      dialog = page.getByRole('dialog', { name: 'حذف المهمة', exact: true });
      await expect(
        dialog.getByRole('button', { name: 'إلغاء', exact: true }),
      ).toBeFocused();
      await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
      await expect(
        page
          .locator('.task-card[data-task-id="' + b + '"]')
          .getByRole('button', { name: 'حذف', exact: true }),
      ).toBeFocused();
      await page
        .locator('.task-card[data-task-id="' + b + '"]')
        .getByRole('button', { name: 'حذف', exact: true })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'تأكيد حذف المهمة', exact: true })
        .click();
      await expect(page.locator('.task-card')).toHaveCount(2);
      await layout('task-board-saved');
      await page.screenshot({
        path: resolve(
          import.meta.dirname,
          '../../../.cache/ui/tasks-' +
            testInfo.project.name +
            '-' +
            viewport.width +
            '.png',
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await chooseProjectStatus(page, 'completed');
      await page
        .getByRole('button', { name: 'تأكيد الحالة', exact: true })
        .click();
      await expect(page.locator('.task-readonly')).toBeVisible();
      await expect(page.locator('.task-card')).toHaveCount(2);
      await expect(page.locator('.task-card-controls')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'مهمة جديدة', exact: true }),
      ).toHaveCount(0);
      await layout('tasks-in-completed-project');
      expect((await projectModel.findById(id).orFail()).version).toBe(2);
    },
  );
}
test('TSK-001 lost create response blocks another submission and explicitly recovers saved tasks', async ({
  page,
}) => {
  await createManualInBrowser(page);
  await page.getByRole('button', { name: 'مهمة جديدة', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('اسم المهمة', { exact: true }).fill('مهمة محفوظة');
  let writes = 0;
  await page.route('**/api/v1/projects/*/tasks', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await dialog
    .getByRole('button', { name: 'إضافة المهمة', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'نتيجة التغيير مش مؤكدة',
  );
  await expect(
    dialog.getByRole('button', { name: 'إضافة المهمة', exact: true }),
  ).toBeDisabled();
  await dialog.locator('form').dispatchEvent('submit');
  expect(writes).toBe(1);
  expect((await taskBoardModel.findOne().orFail()).tasks).toHaveLength(1);
  const confirmation10 = respondToAppConfirmation(page, async (dialog) => {
    expect(dialog.message()).toContain('هنحمّل');
    await dialog.accept();
  });
  await dialog
    .getByRole('button', { name: 'قراءة المهام الحالية', exact: true })
    .click();
  await confirmation10;
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'مهمة جديدة', exact: true }),
  ).toBeEnabled();
  expect(writes).toBe(1);
});
test('TSK-001 conflicting edits keep typed input until explicit review', async ({
  page,
}) => {
  const projectId = await createManualInBrowser(page),
    id = await addTaskInBrowser(page, 'المهمة الأصلية');
  await page
    .locator('.task-card')
    .getByRole('button', { name: 'تعديل', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('اسم المهمة', { exact: true }).fill('تعديل محلي');
  const project = await projectModel.findById(projectId).orFail();
  await createTasks(database, taskBoardModel, projectModel).update(
    project.workspace.toString(),
    projectId,
    id,
    1,
    { title: 'نسخة أحدث', description: '', priority: 'high' },
  );
  await dialog.getByRole('button', { name: 'حفظ المهمة', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('اتغيرت في مكان تاني');
  await expect(dialog.getByLabel('اسم المهمة', { exact: true })).toHaveValue(
    'تعديل محلي',
  );
  await expect(
    dialog.getByRole('button', { name: 'حفظ المهمة', exact: true }),
  ).toBeDisabled();
  const confirmation11 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await dialog
    .getByRole('button', { name: 'قراءة المهام الحالية', exact: true })
    .click();
  await confirmation11;
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.task-card')).toContainText('نسخة أحدث');
  expect((await taskBoardModel.findOne().orFail()).version).toBe(2);
});
test('TSK-001 lost delete response reveals an empty persisted board without deleting the project', async ({
  page,
}) => {
  const projectId = await createManualInBrowser(page);
  await addTaskInBrowser(page, 'مهمة للحذف');
  let writes = 0;
  await page.route('**/api/v1/projects/*/tasks/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue();
      return;
    }
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page
    .locator('.task-card')
    .getByRole('button', { name: 'حذف', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'تأكيد حذف المهمة', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'نتيجة التغيير مش مؤكدة',
  );
  await dialog
    .getByRole('button', { name: 'قراءة المهام الحالية', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.task-card')).toHaveCount(0);
  expect(writes).toBe(1);
  expect((await taskBoardModel.findOne().orFail()).version).toBe(2);
  expect((await projectModel.findById(projectId).orFail()).status).toBe(
    'active',
  );
});
test('TSK-001 project closure during editing rejects the write and recovers read-only tasks', async ({
  page,
}) => {
  const projectId = await createManualInBrowser(page);
  await addTaskInBrowser(page, 'مهمة محفوظة');
  await page
    .locator('.task-card')
    .getByRole('button', { name: 'تعديل', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('اسم المهمة', { exact: true })
    .fill('تغيير بعد الإغلاق');
  const project = await projectModel.findById(projectId).orFail();
  await createProjects(database, projectModel, clientModel).changeStatus(
    project.workspace.toString(),
    projectId,
    1,
    'completed',
  );
  await dialog.getByRole('button', { name: 'حفظ المهمة', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('المشروع اتقفل');
  const confirmation12 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await dialog
    .getByRole('button', { name: 'قراءة المهام الحالية', exact: true })
    .click();
  await confirmation12;
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.task-readonly')).toBeVisible();
  await expect(page.locator('.proposal-page-bar .project-status')).toHaveText(
    'مشروع مكتمل',
  );
  expect((await taskBoardModel.findOne().orFail()).tasks[0]?.title).toBe(
    'مهمة محفوظة',
  );
});

test('TSK-001 expired access renews once and commits one task', async ({
  page,
}) => {
  await createManualInBrowser(page);
  await expect(
    page.getByRole('button', { name: 'مهمة جديدة', exact: true }),
  ).toBeEnabled();
  now = new Date(now.getTime() + 16 * 60 * 1000);
  let refreshes = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/auth/refresh') refreshes++;
  });
  await addTaskInBrowser(page, 'مهمة بعد تجديد الجلسة');
  expect(refreshes).toBe(1);
  const board = await taskBoardModel.findOne().orFail();
  expect(board.version).toBe(1);
  expect(board.tasks).toHaveLength(1);
});

test('TSK-001 changing projects discards a late board response', async ({
  page,
}) => {
  const first = await createManualInBrowser(page);
  await addTaskInBrowser(page, 'مهمة المشروع الأول');
  const project = await projectModel.findById(first).orFail();
  const second = await createProjects(
    database,
    projectModel,
    clientModel,
  ).create(project.workspace.toString(), {
    clientId: project.client.id.toString(),
    title: 'مشروع تاني',
    summary: '',
  });
  await createTasks(database, taskBoardModel, projectModel).create(
    project.workspace.toString(),
    second.id,
    0,
    {
      title: 'مهمة المشروع التاني',
      description: '',
      priority: 'normal',
    },
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const requested = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/v1/projects/' + first + '/tasks', async (route) => {
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole('button', { name: 'تحديث مهام المشروع', exact: true })
      .click();
    await requested;
    await page.getByRole('link', { name: 'كل المشاريع', exact: true }).click();
    await page
      .locator('.project-row')
      .filter({ hasText: 'مشروع تاني' })
      .click();
    await expect(page.locator('.task-card')).toHaveCount(1);
    await expect(page.locator('.task-card')).toContainText(
      'مهمة المشروع التاني',
    );
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.locator('.task-card')).toHaveCount(1);
    await expect(page.locator('.task-card')).toContainText(
      'مهمة المشروع التاني',
    );
    await expect(page.locator('.task-board')).not.toContainText(
      'مهمة المشروع الأول',
    );
  } finally {
    release();
  }
});

async function setTaskVisibilityInBrowser(
  page: Page,
  id: string,
  visible: boolean,
) {
  const card = page.locator('.task-card[data-task-id="' + id + '"]');
  await card
    .getByRole('button', {
      name: visible ? 'السماح بعرضها' : 'إخفاء عن العميل',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'ظهور المهمة للعميل',
    exact: true,
  });
  await expect(
    dialog.getByRole('button', { name: 'إلغاء', exact: true }),
  ).toBeFocused();
  await dialog
    .getByRole('button', {
      name: visible ? 'تأكيد السماح بالعرض' : 'تأكيد الإخفاء',
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(card.locator('.task-visibility')).toHaveAttribute(
    'data-client-visible',
    String(visible),
  );
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(
    'responsive audit TSK-002 progress, visibility confirmation and client preview ' +
      viewport.width,
    async ({ page }, testInfo) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      const projectId = await createManualInBrowser(page);
      const full = page.getByRole('progressbar', {
        name: 'تقدم كل مهام المشروع',
        exact: true,
      });
      const client = page.getByRole('progressbar', {
        name: 'تقدم مهام متابعة العميل',
        exact: true,
      });
      const preview = page.locator('.task-client-preview');
      await expect(
        page.getByRole('button', { name: 'مهمة جديدة', exact: true }),
      ).toBeEnabled();
      await expect(full).toHaveCount(0);
      await expect(page.locator('.task-board > .task-progress')).toContainText(
        'التقدم لسه مش محسوب',
      );
      const layout = async (screen: string) =>
        expect(
          (
            await inspectResponsiveLayout(
              page,
              screen,
              viewport.width <= 960,
              viewport.width,
            )
          ).issues,
          screen,
        ).toEqual([]);
      await layout('empty-task-progress');
      const a = await addTaskInBrowser(
        page,
        'ملاحظات داخلية',
        'high',
        'وصف داخلي خاص',
      );
      const title =
        viewport.width === 320
          ? 'ClientDeliverable'.repeat(7)
          : 'تسليم التصميم';
      const description =
        viewport.width === 320
          ? 'مرجع https://example.com/' + 'a'.repeat(1200)
          : 'تفاصيل التسليم للعميل.';
      const b = await addTaskInBrowser(page, title, 'low', description);
      await expect(full).toHaveAttribute('value', '0');
      await moveTaskInBrowser(page, a, 'done');
      await expect(full).toHaveAttribute('value', '50');
      await preview.locator('summary').click();
      await expect(preview).toContainText('مفيش مهام مسموح عرضها للعميل');
      await expect(client).toHaveCount(0);
      await expect(preview).not.toContainText('ملاحظات داخلية');
      const trigger = page
        .locator('.task-card[data-task-id="' + b + '"]')
        .getByRole('button', { name: 'السماح بعرضها', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', {
        name: 'ظهور المهمة للعميل',
        exact: true,
      });
      await expect(dialog).toContainText('بعنوانها ووصفها وحالتها');
      await expect(
        dialog.getByRole('button', { name: 'إلغاء', exact: true }),
      ).toBeFocused();
      await layout('task-visibility-confirmation');
      await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
      await expect(trigger).toBeFocused();
      await expect(preview.locator('li')).toHaveCount(0);
      await setTaskVisibilityInBrowser(page, b, true);
      await expect(client).toHaveAttribute('value', '0');
      await expect(full).toHaveAttribute('value', '50');
      await expect(preview.locator('li')).toHaveCount(1);
      await expect(preview).toContainText(description);
      await expect(preview).not.toContainText('وصف داخلي خاص');
      await layout('client-task-preview-long-content');
      if (viewport.width === 320)
        expect(
          await preview
            .locator('.task-client-preview-content')
            .evaluate((el) => getComputedStyle(el).animationName),
        ).toBe('none');
      await moveTaskInBrowser(page, b, 'done');
      await expect(full).toHaveAttribute('value', '100');
      await expect(client).toHaveAttribute('value', '100');
      expect((await projectModel.findById(projectId).orFail()).status).toBe(
        'active',
      );
      await moveTaskInBrowser(page, b, 'todo');
      await expect(full).toHaveAttribute('value', '50');
      await expect(client).toHaveAttribute('value', '0');
      await page.reload();
      await expect(full).toHaveAttribute('value', '50');
      await expect(
        page.locator('.task-card[data-task-id="' + b + '"] .task-visibility'),
      ).toHaveAttribute('data-client-visible', 'true');
      await preview.locator('summary').click();
      await expect(client).toHaveAttribute('value', '0');
      await layout('saved-progress-and-client-visibility');
      await page.screenshot({
        path: resolve(
          import.meta.dirname,
          '../../../.cache/ui/task-progress-' +
            testInfo.project.name +
            '-' +
            viewport.width +
            '.png',
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await setTaskVisibilityInBrowser(page, b, false);
      await expect(preview.locator('li')).toHaveCount(0);
      await expect(client).toHaveCount(0);
      await expect(full).toHaveAttribute('value', '50');
      await chooseProjectStatus(page, 'completed');
      await page
        .getByRole('button', { name: 'تأكيد الحالة', exact: true })
        .click();
      await expect(page.locator('.task-readonly')).toBeVisible();
      await expect(full).toHaveAttribute('value', '50');
      await expect(
        page.getByRole('button', { name: 'السماح بعرضها', exact: true }),
      ).toHaveCount(0);
      await layout('closed-project-independent-progress');
    },
  );
}
test('TSK-002 lost visibility response blocks repeated submission and recovers the saved selection', async ({
  page,
}) => {
  await createManualInBrowser(page);
  const id = await addTaskInBrowser(page, 'مهمة للمتابعة');
  let writes = 0;
  await page.route('**/api/v1/projects/*/tasks/*/visibility', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page
    .locator('.task-card')
    .getByRole('button', { name: 'السماح بعرضها', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'تأكيد السماح بالعرض', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'نتيجة التغيير مش مؤكدة',
  );
  await expect(
    dialog.getByRole('button', { name: 'تأكيد السماح بالعرض', exact: true }),
  ).toBeDisabled();
  await dialog.locator('form').dispatchEvent('submit');
  expect(writes).toBe(1);
  expect(
    (await taskBoardModel.findOne().orFail()).tasks[0]?.clientVisible,
  ).toBe(true);
  await dialog
    .getByRole('button', { name: 'قراءة المهام الحالية', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator('.task-card[data-task-id="' + id + '"] .task-visibility'),
  ).toHaveAttribute('data-client-visible', 'true');
  await page.locator('.task-client-preview summary').click();
  await expect(page.locator('.task-client-preview li')).toHaveCount(1);
  expect(writes).toBe(1);
});
test('TSK-002 stale visibility confirmation requires explicit review of the current board', async ({
  page,
}) => {
  const projectId = await createManualInBrowser(page);
  const id = await addTaskInBrowser(page, 'متابعة العميل');
  await page
    .locator('.task-card')
    .getByRole('button', { name: 'السماح بعرضها', exact: true })
    .click();
  const project = await projectModel.findById(projectId).orFail();
  await createTasks(database, taskBoardModel, projectModel).setClientVisibility(
    project.workspace.toString(),
    projectId,
    id,
    1,
    true,
  );
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'تأكيد السماح بالعرض', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('اتغيرت في مكان تاني');
  await expect(
    dialog.getByRole('button', { name: 'تأكيد السماح بالعرض', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole('button', { name: 'قراءة المهام الحالية', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .locator('.task-card')
      .getByRole('button', { name: 'إخفاء عن العميل', exact: true }),
  ).toBeEnabled();
  expect((await taskBoardModel.findOne().orFail()).version).toBe(2);
});

defineResponsiveTests(async () => {
  const stressAccount = {
    name: 'أحمد ' + 'ع'.repeat(94),
    workspaceName: 'استوديو ' + 'س'.repeat(80),
    email: 'designer.' + 'a'.repeat(40) + '@' + 'b'.repeat(45) + '.example.com',
    password: account.password,
  };
  await registerAccount.execute(stressAccount);
  const login = await sessions.login.execute(stressAccount);
  const workspaceId = login.identity.workspace.id;
  const client = await clients.create(workspaceId, {
    name: 'شركة ' + 'ورقة'.repeat(23),
    company: 'BrandStudio'.repeat(10),
    email: 'client.' + 'c'.repeat(40) + '@' + 'd'.repeat(45) + '.example.com',
    phone: '+20 100 555 4444',
    notes: 'بيانات مراجعة الاستجابة.',
  });
  const content = {
    clientId: client.id,
    title: 'تصميم وتنفيذ الهوية البصرية '.padEnd(120, 'م'),
    summary:
      'نطاق شغل طويل، مع مرجع غير قابل للفصل: https://example.com/' +
      'a'.repeat(900),
    terms: 'دفعات التسليم ومواعيد المراجعة بالتفصيل. '.repeat(35),
    currency: 'EGP',
    items: [
      {
        title: 'تصميم الهوية '.padEnd(120, 'ب'),
        quantity: 50,
        unitPrice: '9999999.99',
      },
      {
        title: 'إعداد دليل الاستخدام والمراجعة '.repeat(3),
        quantity: 10000,
        unitPrice: '1250.50',
      },
    ],
  };
  const draft = await proposals.create(workspaceId, content);
  const sharing = createProposalSharing(proposalModel, () => shareNow);
  const shared = await proposals.create(workspaceId, content);
  const grant = await sharing.issue(
    workspaceId,
    stressAccount.workspaceName,
    shared.id,
    1,
    7,
  );
  const accepted = await proposals.create(workspaceId, content);
  const acceptedGrant = await sharing.issue(
    workspaceId,
    stressAccount.workspaceName,
    accepted.id,
    1,
    7,
  );
  await createProposalDecisions(
    database,
    proposalModel,
    projectModel,
    () => shareNow,
  ).execute(acceptedGrant.token, 'accept', randomUUID());
  const projectId = (await proposals.read(workspaceId, accepted.id)).projectId;
  if (!projectId) throw new Error('Responsive seed project was not created');
  return {
    account: stressAccount,
    clientName: client.name,
    draftId: draft.id,
    sharedToken: grant.token,
    projectId,
  };
});
async function prepareInvoice(page: Page, withProject = false) {
  const client = await seedManualClient(page);
  const workspace = await models.Workspace.findOne().orFail();
  const project = withProject
    ? await createProjects(database, projectModel, clientModel).create(
        workspace.id,
        {
          clientId: client.id,
          title: 'مشروع الموقع',
          summary: '',
        },
      )
    : null;
  await page.goto('/invoices/new');
  await page
    .getByLabel('عنوان الفاتورة', { exact: true })
    .fill('فاتورة تنفيذ الموقع');
  await page.getByRole('button', { name: /سارة علي/ }).click();
  await page.getByLabel('وصف البند 1', { exact: true }).fill('التصميم');
  await page.getByLabel('الكمية 1', { exact: true }).fill('3');
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('0.10');
  if (project)
    await selectOption(
      page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
      project.id,
    );
  return { client, project, workspace };
}
test('INV-001 exact create, optional project and frozen client snapshot', async ({
  page,
}) => {
  const { client, project, workspace } = await prepareInvoice(page, true);
  await page.getByRole('button', { name: 'إضافة بند', exact: true }).click();
  await expect(page.getByLabel('وصف البند 2', { exact: true })).toBeFocused();
  await page.getByLabel('وصف البند 2', { exact: true }).fill('المراجعة');
  await page.getByLabel('سعر الوحدة 2', { exact: true }).fill('0.20');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
  await expect(page.locator('.invoice-number')).toHaveText('INV-000001');
  await expect(page.locator('.proposal-final-total')).toContainText('٠٫٥٠');
  await expect(
    page.getByRole('link', { name: 'المشروع: مشروع الموقع', exact: true }),
  ).toHaveAttribute('href', '/projects/' + project?.id);
  const saved = await invoiceModels.Invoice.findOne().orFail();
  expect(saved.totalMinor).toBe(50);
  await clientModel.updateOne(
    { _id: client.id },
    { $set: { name: 'اسم جديد', archivedAt: new Date() } },
  );
  await page.reload();
  await expect(page.locator('.proposal-recipient')).toContainText('سارة علي');
  await expect(page.locator('.proposal-recipient')).not.toContainText(
    'اسم جديد',
  );
  await page.getByRole('link', { name: 'كل الفواتير', exact: true }).click();
  await expect(page.locator('.proposal-row')).toHaveCount(1);
  await expect(page.locator('.proposal-row')).toContainText('INV-000001');
  expect(
    (await invoiceModels.Counter.findById(workspace.id).orFail()).sequence,
  ).toBe(1);
});
test('INV-001 validation prevents over-precision and recovers without changing intent', async ({
  page,
}) => {
  await prepareInvoice(page);
  let writes = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/v1/invoices'
    )
      writes++;
  });
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('1.005');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(
    page.getByLabel('سعر الوحدة 1', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true');
  expect(writes).toBe(0);
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('1.25');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
  expect((await invoiceModels.Invoice.findOne().orFail()).totalMinor).toBe(375);
  expect(writes).toBe(1);
});
test('INV-001 lost create response blocks a duplicate and recovers through the ledger', async ({
  page,
}) => {
  await prepareInvoice(page);
  let writes = 0;
  await page.route('**/api/v1/invoices', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش متأكدين',
  );
  await expect(
    page.getByRole('button', { name: 'حفظ المسودة', exact: true }),
  ).toBeDisabled();
  await page.locator('.proposal-editor').dispatchEvent('submit');
  expect(writes).toBe(1);
  expect(await invoiceModels.Invoice.countDocuments()).toBe(1);
  await page
    .getByRole('link', { name: 'مراجعة دفتر الفواتير', exact: true })
    .click();
  await expect(page.locator('.proposal-row')).toHaveCount(1);
  await page.locator('.proposal-row').click();
  await expect(page.locator('.invoice-number')).toHaveText('INV-000001');
  expect(writes).toBe(1);
});
test('INV-001 committed creation stays guarded while detail navigation is delayed', async ({
  page,
}) => {
  await prepareInvoice(page);
  let writes = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/v1/invoices'
    )
      writes++;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const navigation = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route(
    (url) =>
      url.origin === 'http://localhost:3100' &&
      /^\/invoices\/[a-f0-9]{24}$/u.test(url.pathname),
    async (route) => {
      arrived();
      await gate;
      await route.continue();
    },
  );
  try {
    await page
      .getByRole('button', { name: 'حفظ المسودة', exact: true })
      .click();
    await navigation;
    await expect(
      page.getByRole('link', { name: 'فتح الفاتورة المحفوظة', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'حفظ المسودة', exact: true }),
    ).toBeDisabled();
    await page.locator('.proposal-editor').dispatchEvent('submit');
    expect(writes).toBe(1);
    expect(await invoiceModels.Invoice.countDocuments()).toBe(1);
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
});
test('INV-001 client changes clear project selection and never offer another clients project', async ({
  page,
}) => {
  const { workspace } = await prepareInvoice(page, true);
  const other = await clients.create(workspace.id, {
    name: 'عميل ثاني',
    company: '',
    email: '',
    phone: '',
    notes: '',
  });
  const otherProject = await createProjects(
    database,
    projectModel,
    clientModel,
  ).create(workspace.id, {
    clientId: other.id,
    title: 'مشروع العميل الثاني',
    summary: '',
  });
  await page.getByRole('button', { name: 'تغيير العميل', exact: true }).click();
  await page.getByRole('button', { name: /عميل ثاني/ }).click();
  await expect(
    page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
  ).toHaveAttribute('value', '');
  await expect(
    page.locator('[id="invoice-project-options"] [role="option"]'),
  ).toHaveCount(2);
  await expect(
    page.locator('[id="invoice-project-options"]'),
  ).not.toContainText('مشروع الموقع');
  await selectOption(
    page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
    otherProject.id,
  );
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
  expect(
    (await invoiceModels.Invoice.findOne().orFail()).client.id.toString(),
  ).toBe(other.id);
});
test('INV-001 expired access renews once without duplicating the invoice', async ({
  page,
}) => {
  await prepareInvoice(page);
  now = new Date(now.getTime() + 16 * 60 * 1000);
  let writes = 0,
    refreshes = 0;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/invoices' && request.method() === 'POST') writes++;
    if (path === '/api/v1/auth/refresh') refreshes++;
  });
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
  expect(writes).toBe(2);
  expect(refreshes).toBe(1);
  expect(await invoiceModels.Invoice.countDocuments()).toBe(1);
});
test('INV-001 list pagination keeps earlier rows on failure and explicitly retries', async ({
  page,
}) => {
  const client = await seedManualClient(page);
  const workspace = await models.Workspace.findOne().orFail();
  const service = createInvoices(
    database,
    invoiceModels,
    clientModel,
    projectModel,
  );
  for (let i = 0; i < 27; i++)
    await service.create(workspace.id, {
      requestId: randomUUID(),
      clientId: client.id,
      projectId: null,
      title: 'فاتورة ' + i,
      summary: '',
      terms: '',
      currency: 'USD',
      items: [{ title: 'تصميم', quantity: 1, unitPrice: '10' }],
    });
  await page.goto('/invoices');
  await expect(page.locator('.proposal-row')).toHaveCount(25);
  let calls = 0;
  await page.route('**/api/v1/invoices?cursor=*', (route) => {
    calls++;
    return calls === 1
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR' },
          }),
        })
      : route.continue();
  });
  await page.getByRole('button', { name: 'فواتير أكتر', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('.proposal-row')).toHaveCount(25);
  await page
    .getByRole('button', { name: 'إعادة المحاولة', exact: true })
    .click();
  await expect(page.locator('.proposal-row')).toHaveCount(27);
  expect(calls).toBe(2);
  await expect(
    page.getByRole('button', { name: 'فواتير أكتر', exact: true }),
  ).toHaveCount(0);
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(
    'responsive audit INV-001 invoice creation, exact totals and numbered review ' +
      viewport.width,
    async ({ page }, testInfo) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      const layout = async (screen: string) =>
        expect(
          (
            await inspectResponsiveLayout(
              page,
              screen,
              viewport.width <= 960,
              viewport.width,
            )
          ).issues,
          screen,
        ).toEqual([]);
      const client = await seedManualClient(page);
      await page.goto('/invoices');
      await expect(
        page.getByRole('heading', {
          name: 'أول فاتورة في الدفتر.',
          exact: true,
        }),
      ).toBeVisible();
      await layout('empty-invoice-ledger');
      await page
        .getByRole('link', { name: 'اكتب أول فاتورة', exact: true })
        .click();
      await expect(
        page.getByLabel('عنوان الفاتورة', { exact: true }),
      ).toBeVisible();
      await layout('new-invoice-form');
      await page.getByRole('button', { name: /سارة علي/ }).click();
      await page
        .getByLabel('عنوان الفاتورة', { exact: true })
        .fill('InvoiceDocument'.repeat(8));
      await page
        .getByLabel('نطاق الشغل', { exact: false })
        .fill('https://example.com/' + 'a'.repeat(1200));
      await page
        .getByLabel('وصف البند 1', { exact: true })
        .fill('InvoiceLine'.repeat(10));
      await page.getByLabel('الكمية 1', { exact: true }).fill('10000');
      await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('100000.00');
      await selectOption(
        page.getByRole('combobox', {
          name: 'عملة الفاتورة',
          ...{ exact: true },
        }),
        'SAR',
      );
      await layout('long-invoice-form');
      await page
        .getByRole('button', { name: 'حفظ المسودة', exact: true })
        .click();
      await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
      await expect(page.locator('.proposal-recipient')).toContainText(
        client.name,
      );
      await layout('invoice-numbered-document');
      if (viewport.width === 320) {
        await expect(
          page.getByRole('region', {
            name: 'بنود الفاتورة، جدول قابل للتمرير',
            exact: true,
          }),
        ).toHaveAttribute('tabindex', '0');
      }
      await page.screenshot({
        path: testInfo.outputPath('invoice-review.png'),
        fullPage: true,
        animations: 'disabled',
      });
      await page
        .getByRole('link', { name: 'كل الفواتير', exact: true })
        .click();
      await expect(page.locator('.proposal-row')).toHaveCount(1);
      await layout('invoice-ledger-row');
    },
  );
}

test('INV-001 optional project picker loads later pages and cancels previous client results', async ({
  page,
}) => {
  const client = await seedManualClient(page);
  const workspace = await models.Workspace.findOne().orFail();
  const other = await clients.create(workspace.id, {
    name: 'عميل ثاني',
    company: '',
    email: '',
    phone: '',
    notes: '',
  });
  const projects = createProjects(database, projectModel, clientModel);
  const older = await projects.create(workspace.id, {
    clientId: client.id,
    title: 'المشروع الأقدم',
    summary: '',
  });
  for (let i = 0; i < 26; i++)
    await projects.create(workspace.id, {
      clientId: other.id,
      title: 'مشروع العميل الثاني ' + i,
      summary: '',
    });
  await page.goto('/invoices/new');
  await page.getByRole('button', { name: /سارة علي/ }).click();
  await expect(
    page.locator('[id="invoice-project-options"] [role="option"]'),
  ).toHaveCount(1);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const navigation = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/v1/projects?status=all&cursor=*', async (route) => {
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole('button', { name: 'تحميل باقي المشاريع', exact: true })
      .click();
    await navigation;
    await page
      .getByRole('button', { name: 'تغيير العميل', exact: true })
      .click();
    await page.getByRole('button', { name: /عميل ثاني/ }).click();
    await expect(
      page.locator('[id="invoice-project-options"] [role="option"]'),
    ).toHaveCount(26);
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(
      page.locator('[id="invoice-project-options"]'),
    ).not.toContainText(older.title);
  } finally {
    release();
  }
  await page.unroute('**/api/v1/projects?status=all&cursor=*');
  await page.getByRole('button', { name: 'تغيير العميل', exact: true }).click();
  await page.getByRole('button', { name: /سارة علي/ }).click();
  await page
    .getByRole('button', { name: 'تحميل باقي المشاريع', exact: true })
    .click();
  await expect(
    page.locator('[id="invoice-project-options"] [role="option"]'),
  ).toHaveCount(2);
  await selectOption(
    page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
    older.id,
  );
  await expect(
    page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
  ).toHaveAttribute('value', older.id);
});
async function savedInvoiceInBrowser(page: Page, withProject = false) {
  const seed = await prepareInvoice(page, withProject);
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
  return { ...seed, id: page.url().split('/').at(-1)! };
}
async function issueInvoiceInBrowser(page: Page) {
  await page
    .getByLabel('راجعت الفاتورة وجاهز لإصدارها.', { exact: true })
    .check();
  const confirmation13 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'إصدار الفاتورة', exact: true })
    .click();
  await confirmation13;
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true }),
  ).toBeEnabled();
}
async function shareInvoiceInBrowser(page: Page) {
  await page
    .getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true })
    .click();
  await expect(page.getByLabel('رابط العميل', { exact: true })).toBeVisible();
  return page.getByLabel('رابط العميل', { exact: true }).inputValue();
}
test('INV-002 edits a numbered draft, captures current client at issuance and shares a frozen safe document', async ({
  page,
  browser,
}) => {
  const { id, client, workspace, project } = await savedInvoiceInBrowser(
    page,
    true,
  );
  await page.getByRole('link', { name: 'تعديل المسودة', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
  ).not.toHaveAttribute('value', '');
  await selectOption(
    page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
    '',
  );
  let warned = false;
  const confirmation14 = respondToAppConfirmation(page, async (dialog) => {
    warned = true;
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'رجوع للفاتورة', exact: true }).click();
  await confirmation14;
  expect(warned).toBe(true);
  await expect(page).toHaveURL('/invoices/' + id + '/edit');
  await selectOption(
    page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
    project!.id,
  );
  await page
    .getByLabel('عنوان الفاتورة', { exact: true })
    .fill('نسخة الفاتورة المراجعة');
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('1.25');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page).toHaveURL('/invoices/' + id);
  await expect(page.locator('.invoice-number')).toHaveText('INV-000001');
  expect(
    (await invoiceModels.Counter.findById(workspace.id).orFail()).sequence,
  ).toBe(1);
  await clients.update(workspace.id, client.id, client.version, {
    name: 'العميل وقت الإصدار',
    company: 'شركة الإصدار',
    email: client.email,
    phone: client.phone,
    notes: 'OWNER PRIVATE NOTE',
  });
  await issueInvoiceInBrowser(page);
  await expect(
    page.getByRole('link', { name: 'تعديل المسودة', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.proposal-recipient')).toContainText(
    'العميل وقت الإصدار',
  );
  const link = await shareInvoiceInBrowser(page);
  const viewerContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    const requests: string[] = [];
    viewer.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v1/public/invoices/read') {
        requests.push(request.url());
        expect(request.headers().authorization).toBeUndefined();
        expect(request.postDataJSON()).toEqual({ token: link.split('#')[1] });
      }
    });
    await viewer.goto(link);
    await expect(
      viewer.getByRole('heading', {
        name: 'نسخة الفاتورة المراجعة',
        exact: true,
      }),
    ).toBeVisible();
    await expect(viewer.locator('.proposal-final-total')).toContainText('٣٫٧٥');
    await expect(viewer.locator('.proposal-recipient')).toContainText(
      'شركة الإصدار',
    );
    await expect(viewer.getByRole('main')).not.toContainText(client.email);
    await expect(viewer.getByRole('main')).not.toContainText(client.phone);
    await expect(viewer.getByRole('main')).not.toContainText(
      'OWNER PRIVATE NOTE',
    );
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) expect(url).not.toContain(link.split('#')[1]);
    await clientModel.updateOne(
      { _id: client.id },
      { $set: { name: 'اسم لاحق', company: 'شركة لاحقة' } },
    );
    await viewer.reload();
    await expect(viewer.locator('.proposal-recipient')).toContainText(
      'شركة الإصدار',
    );
    await expect(viewer.locator('.proposal-recipient')).not.toContainText(
      'شركة لاحقة',
    );
    await page.goto('/invoices/' + id + '/edit');
    await expect(
      page.getByRole('heading', { name: 'الفاتورة للقراءة فقط', exact: true }),
    ).toBeVisible();
  } finally {
    await viewerContext.close();
  }
});
test('INV-002 edit conflicts retain input until explicit reload and lost edits block a second write', async ({
  page,
}) => {
  const { id, workspace } = await savedInvoiceInBrowser(page);
  await page.getByRole('link', { name: 'تعديل المسودة', exact: true }).click();
  await page.getByLabel('عنوان الفاتورة', { exact: true }).fill('تعديل محلي');
  const service = createInvoices(
    database,
    invoiceModels,
    clientModel,
    projectModel,
    () => shareNow,
  );
  const invoice = await service.read(workspace.id, id);
  await service.update(workspace.id, id, 1, {
    clientId: invoice.client.id,
    projectId: null,
    title: 'تعديل آخر',
    summary: '',
    terms: '',
    currency: 'EGP',
    items: [{ title: 'تصميم', quantity: 1, unitPrice: '10' }],
  });
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'اتغيرت',
  );
  await expect(page.getByLabel('عنوان الفاتورة', { exact: true })).toHaveValue(
    'تعديل محلي',
  );
  await expect(
    page.getByRole('button', { name: 'حفظ المسودة', exact: true }),
  ).toBeDisabled();
  const confirmation15 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'تحميل آخر نسخة', exact: true })
    .click();
  await confirmation15;
  await expect(page.getByLabel('عنوان الفاتورة', { exact: true })).toHaveValue(
    'تعديل آخر',
  );
  await page.getByLabel('عنوان الفاتورة', { exact: true }).fill('تعديل محفوظ');
  let writes = 0;
  await page.route('**/api/v1/invoices/' + id, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'مش متأكدين',
  );
  await page.locator('.proposal-editor').dispatchEvent('submit');
  expect(writes).toBe(1);
  await page.unrouteAll({ behavior: 'wait' });
  const confirmation16 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'تحميل آخر نسخة', exact: true })
    .click();
  await confirmation16;
  await expect(page.getByLabel('عنوان الفاتورة', { exact: true })).toHaveValue(
    'تعديل محفوظ',
  );
  expect((await invoiceModels.Invoice.findById(id).orFail()).version).toBe(3);
});
test('INV-002 lost issuance blocks another write and explicit read recovers the immutable invoice', async ({
  page,
}) => {
  const { id } = await savedInvoiceInBrowser(page);
  let writes = 0;
  await page.route('**/api/v1/invoices/' + id + '/issue', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page
    .getByLabel('راجعت الفاتورة وجاهز لإصدارها.', { exact: true })
    .check();
  const confirmation17 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'إصدار الفاتورة', exact: true })
    .click();
  await confirmation17;
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'نتيجة الإصدار مش مؤكدة',
  );
  await expect(
    page.getByRole('button', { name: 'إصدار الفاتورة', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'إصدار الفاتورة', exact: true })
    .dispatchEvent('click');
  expect(writes).toBe(1);
  await page
    .getByRole('button', { name: 'قراءة الفاتورة الحالية', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('link', { name: 'تعديل المسودة', exact: true }),
  ).toHaveCount(0);
  expect((await invoiceModels.Invoice.findById(id).orFail()).version).toBe(2);
});
test('INV-002 stale issuance requires reviewing current content again', async ({
  page,
}) => {
  const { id, workspace } = await savedInvoiceInBrowser(page);
  await page
    .getByLabel('راجعت الفاتورة وجاهز لإصدارها.', { exact: true })
    .check();
  const service = createInvoices(
      database,
      invoiceModels,
      clientModel,
      projectModel,
      () => shareNow,
    ),
    invoice = await service.read(workspace.id, id);
  await service.update(workspace.id, id, 1, {
    clientId: invoice.client.id,
    projectId: null,
    title: 'فاتورة محدثة',
    summary: '',
    terms: '',
    currency: 'USD',
    items: [{ title: 'تصميم', quantity: 1, unitPrice: '25' }],
  });
  const confirmation18 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'إصدار الفاتورة', exact: true })
    .click();
  await confirmation18;
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'اتغيرت',
  );
  await page
    .getByRole('button', { name: 'قراءة الفاتورة الحالية', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'فاتورة محدثة', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('راجعت الفاتورة وجاهز لإصدارها.', { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'إصدار الفاتورة', exact: true }),
  ).toBeDisabled();
  await issueInvoiceInBrowser(page);
  expect((await invoiceModels.Invoice.findById(id).orFail()).totalMinor).toBe(
    2500,
  );
});
test('INV-002 unknown sharing and revocation outcomes require a read and do not unlock the invoice', async ({
  page,
}) => {
  const { id } = await savedInvoiceInBrowser(page);
  await issueInvoiceInBrowser(page);
  let shares = 0,
    revokes = 0;
  await page.route('**/api/v1/invoices/' + id + '/share', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    shares++;
    await route.fetch();
    await route.abort('failed');
  });
  await page
    .getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'نتيجة تغيير الرابط مش مؤكدة',
  );
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'إنشاء رابط مشاركة', exact: true })
    .dispatchEvent('click');
  expect(shares).toBe(1);
  await page.unrouteAll({ behavior: 'wait' });
  await page
    .getByRole('button', { name: 'تحديث الفاتورة وحالة الرابط', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'تجديد رابط المشاركة', exact: true }),
  ).toBeEnabled();
  const confirmation19 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'تجديد رابط المشاركة', exact: true })
    .click();
  await confirmation19;
  const link = await page
    .getByLabel('رابط العميل', { exact: true })
    .inputValue();
  await page.route(
    '**/api/v1/invoices/' + id + '/share/revoke',
    async (route) => {
      revokes++;
      await route.fetch();
      await route.abort('failed');
    },
  );
  const confirmation20 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page.getByRole('button', { name: 'إلغاء الرابط', exact: true }).click();
  await confirmation20;
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'نتيجة تغيير الرابط مش مؤكدة',
  );
  await expect(page.getByLabel('رابط العميل', { exact: true })).toHaveCount(0);
  expect(revokes).toBe(1);
  await page
    .getByRole('button', { name: 'تحديث الفاتورة وحالة الرابط', exact: true })
    .click();
  await expect(page.locator('.proposal-share-state')).toContainText(
    'الرابط ملغي',
  );
  expect((await invoiceModels.Invoice.findById(id).orFail()).status).toBe(
    'issued',
  );
  await page.goto(link);
  await expect(
    page.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
  ).toBeVisible();
});
test('INV-002 renewal expires the old link and deadline recheck clears rendered invoice', async ({
  page,
  browser,
}) => {
  await savedInvoiceInBrowser(page);
  await issueInvoiceInBrowser(page);
  const old = await shareInvoiceInBrowser(page);
  const confirmation21 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'تجديد رابط المشاركة', exact: true })
    .click();
  await confirmation21;
  const link = await page
    .getByLabel('رابط العميل', { exact: true })
    .inputValue();
  const context = await browser.newContext();
  try {
    const viewer = await context.newPage();
    await viewer.goto(old);
    await expect(
      viewer.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
    ).toBeVisible();
    let initial = true;
    await viewer.route('**/api/v1/public/invoices/read', async (route) => {
      const response = await route.fetch();
      if (initial) {
        const body = await response.json();
        body.data.validForSeconds = 1;
        await route.fulfill({ response, json: body });
      } else await route.fulfill({ response });
    });
    await viewer.goto(link);
    await expect(viewer.locator('.invoice-number')).toHaveText('INV-000001');
    initial = false;
    shareNow = new Date(shareNow.getTime() + 8 * 86400000);
    await expect(
      viewer.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
    ).toBeVisible();
    await expect(viewer.locator('.proposal-review')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test('INV-002 public hash changes cancel stale contents and background restoration requires explicit network recovery', async ({
  page,
  browser,
}) => {
  const { id, workspace, client } = await savedInvoiceInBrowser(page);
  await issueInvoiceInBrowser(page);
  const a = await shareInvoiceInBrowser(page);
  const service = createInvoices(
      database,
      invoiceModels,
      clientModel,
      projectModel,
      () => shareNow,
    ),
    second = await service.create(workspace.id, {
      requestId: randomUUID(),
      clientId: client.id,
      projectId: null,
      title: 'فاتورة ثانية',
      summary: '',
      terms: '',
      currency: 'USD',
      items: [{ title: 'شغل جديد', quantity: 1, unitPrice: '20' }],
    });
  await service.issue(workspace.id, second.id, 1, account.workspaceName);
  const grant = await createInvoiceSharing(invoiceModels, () => shareNow).issue(
    workspace.id,
    second.id,
    2,
    7,
  );
  const context = await browser.newContext();
  try {
    const viewer = await context.newPage();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const requested = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await viewer.route('**/api/v1/public/invoices/read', async (route) => {
      if (route.request().postDataJSON().token !== a.split('#')[1])
        return route.continue();
      const response = await route.fetch();
      arrived();
      await gate;
      await route.fulfill({ response });
    });
    try {
      await viewer.goto(a);
      await requested;
      await viewer.evaluate((token) => {
        window.location.hash = token;
      }, grant.token);
      await expect(
        viewer.getByRole('heading', { name: 'فاتورة ثانية', exact: true }),
      ).toBeVisible();
      release();
      await viewer.unrouteAll({ behavior: 'wait' });
      await expect(viewer.getByRole('main')).not.toContainText(
        'فاتورة تنفيذ الموقع',
      );
    } finally {
      release();
    }
    let reads = 0;
    let unavailable = true;
    await viewer.route('**/api/v1/public/invoices/read', (route) => {
      reads++;
      return unavailable
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: { code: 'SERVER_ERROR' },
            }),
          })
        : route.continue();
    });
    await viewer.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      ),
    );
    await expect(
      viewer.getByRole('heading', {
        name: 'مش قادرين نفتح الفاتورة دلوقتي',
        exact: true,
      }),
    ).toBeVisible();
    await expect(viewer.locator('.proposal-review')).toHaveCount(0);
    const failedReads = reads;
    await viewer.waitForTimeout(300);
    expect(reads).toBe(failedReads);
    unavailable = false;
    await viewer
      .getByRole('button', { name: 'إعادة المحاولة', exact: true })
      .click();
    await expect(
      viewer.getByRole('heading', { name: 'فاتورة ثانية', exact: true }),
    ).toBeVisible();
    expect(reads).toBeGreaterThan(failedReads);
    const completedReads = reads;
    await viewer.waitForTimeout(300);
    expect(reads).toBe(completedReads);
    expect((await invoiceModels.Invoice.findById(id).orFail()).status).toBe(
      'issued',
    );
  } finally {
    await context.close();
  }
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(
    'responsive audit INV-002 draft edit, immutable issuance and public invoice ' +
      viewport.width,
    async ({ page }, testInfo) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      const layout = async (screen: string) =>
        expect(
          (
            await inspectResponsiveLayout(
              page,
              screen,
              viewport.width <= 960,
              viewport.width,
            )
          ).issues,
          screen,
        ).toEqual([]);
      const { id, workspace } = await savedInvoiceInBrowser(page, true);
      await page
        .getByLabel('راجعت الفاتورة وجاهز لإصدارها.', { exact: true })
        .check();
      await layout('draft-invoice-review');
      await page
        .getByRole('link', { name: 'تعديل المسودة', exact: true })
        .click();
      await page
        .getByLabel('عنوان الفاتورة', { exact: true })
        .fill('InvoiceDocument'.repeat(8));
      await page
        .getByLabel('نطاق الشغل', { exact: false })
        .fill('https://example.com/' + 'a'.repeat(1200));
      await page
        .getByLabel('وصف البند 1', { exact: true })
        .fill('InvoiceLine'.repeat(10));
      await page.getByLabel('الكمية 1', { exact: true }).fill('10000');
      await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('100000.00');
      await layout('long-invoice-draft-edit');
      await page
        .getByRole('button', { name: 'حفظ المسودة', exact: true })
        .click();
      await expect(page).toHaveURL('/invoices/' + id);
      await issueInvoiceInBrowser(page);
      await layout('issued-private-invoice');
      const link = await shareInvoiceInBrowser(page);
      await layout('generated-invoice-link');
      await page.goto(link);
      await expect(page.locator('.invoice-number')).toHaveText('INV-000001');
      await layout('public-issued-invoice');
      await page.screenshot({
        path: testInfo.outputPath('public-invoice.png'),
        fullPage: true,
        animations: 'disabled',
      });
      await createInvoiceSharing(invoiceModels, () => shareNow).revoke(
        workspace.id,
        id,
        4,
      );
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent('pageshow', { persisted: true }),
        ),
      );
      await expect(
        page.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
      ).toBeVisible();
      await layout('revoked-public-invoice');
      await page.goto('/invoices/' + id);
      await expect(page.locator('.proposal-share-state')).toContainText(
        'الرابط ملغي',
      );
      await layout('revoked-private-issued-invoice');
      await expect(
        page.getByRole('link', { name: 'تعديل المسودة', exact: true }),
      ).toHaveCount(0);
    },
  );
}

async function paymentInvoice(page: Page, total?: string) {
  let seed: Awaited<ReturnType<typeof savedInvoiceInBrowser>>;
  if (total) {
    const prepared = await prepareInvoice(page, true);
    await page.getByLabel('الكمية 1', { exact: true }).fill('1');
    await page.getByLabel('سعر الوحدة 1', { exact: true }).fill(total);
    await page
      .getByRole('button', { name: 'حفظ المسودة', exact: true })
      .click();
    await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
    seed = { ...prepared, id: page.url().split('/').at(-1)! };
  } else seed = await savedInvoiceInBrowser(page, true);
  await expect(page.locator('.payment-balance')).toHaveAttribute(
    'data-payment-status',
    'not_issued',
  );
  await issueInvoiceInBrowser(page);
  await expect(
    page
      .locator('.payment-ledger')
      .getByRole('button', { name: 'تسجيل دفعة', exact: true }),
  ).toBeEnabled();
  return seed;
}
async function openPayment(page: Page, amount: string) {
  await page
    .locator('.payment-ledger')
    .getByRole('button', { name: 'تسجيل دفعة', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('المبلغ (EGP)', { exact: true }).fill(amount);
}
async function confirmPayment(page: Page) {
  const confirmation22 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'تأكيد تسجيل الدفعة', exact: true })
    .click();
  await confirmation22;
}
async function recordPayment(page: Page, amount: string) {
  await openPayment(page, amount);
  await confirmPayment(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('PAY-001 partial/full payments and auditable corrections preserve issued invoice and public grant', async ({
  page,
  browser,
}) => {
  const { id } = await paymentInvoice(page),
    link = await shareInvoiceInBrowser(page),
    before = await invoiceModels.Invoice.findById(id).lean();
  await openPayment(page, '0.10');
  await selectOption(
    page.getByRole('combobox', { name: 'طريقة الاستلام', exact: true }),
    'wallet',
  );
  await page.getByLabel('مرجع الدفعة', { exact: false }).fill('bank-01');
  await page
    .getByLabel('ملاحظة', { exact: false })
    .fill('ملاحظة لصاحب السجل فقط');
  await confirmPayment(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    (await paymentModel.findOne({ invoice: id }).orFail()).entries[0]?.method,
  ).toBe('wallet');
  await expect(page.locator('.payment-balance')).toHaveAttribute(
    'data-payment-status',
    'partially_paid',
  );
  await expect(page.getByTestId('paid-balance')).toContainText('٠٫١٠');
  await expect(page.getByTestId('remaining-balance')).toContainText('٠٫٢٠');
  await recordPayment(page, '0.20');
  await expect(page.locator('.payment-balance')).toHaveAttribute(
    'data-payment-status',
    'paid',
  );
  await expect(
    page
      .locator('.payment-ledger')
      .getByRole('button', { name: 'تسجيل دفعة', exact: true }),
  ).toHaveCount(0);
  await page
    .locator('.payment-entries li')
    .first()
    .getByRole('button', { name: 'إلغاء أثر الدفعة', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'رجوع', exact: true }),
  ).toBeFocused();
  await page
    .getByLabel('سبب الإلغاء', { exact: true })
    .fill('دفعة اتسجلت مرتين');
  const confirmation23 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'تأكيد إلغاء الأثر', exact: true })
    .click();
  await confirmation23;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('paid-balance')).toContainText('٠٫١٠');
  await expect(
    page.locator('.payment-entries li[data-voided="true"]'),
  ).toContainText('دفعة اتسجلت مرتين');
  expect(await invoiceModels.Invoice.findById(id).lean()).toEqual(before);
  await page.reload();
  await expect(page.locator('.payment-entries li')).toHaveCount(2);
  const context = await browser.newContext();
  try {
    const viewer = await context.newPage();
    await viewer.goto(link);
    await expect(viewer.locator('.invoice-number')).toHaveText('INV-000001');
    await expect(viewer.getByRole('main')).not.toContainText(
      'ملاحظة لصاحب السجل فقط',
    );
    await expect(viewer.locator('.payment-ledger')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test('PAY-001 lost payment response blocks writes and explicit reread keeps the same payment attempt', async ({
  page,
}) => {
  const { id } = await paymentInvoice(page),
    keys: string[] = [];
  let writes = 0;
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname ===
        '/api/v1/invoices/' + id + '/payments' &&
      request.method() === 'POST'
    )
      keys.push(request.postDataJSON().requestId);
  });
  await page.route('**/api/v1/invoices/' + id + '/payments', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await openPayment(page, '0.10');
  await confirmPayment(page);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'مش مؤكدة',
  );
  await page.getByRole('dialog').locator('form').dispatchEvent('submit');
  expect(writes).toBe(1);
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'تأكيد تسجيل الدفعة', exact: true }),
  ).toBeDisabled();
  await page.unrouteAll({ behavior: 'wait' });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'قراءة سجل الدفعات الحالي', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'تأكيد تسجيل الدفعة', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('المبلغ (EGP)', { exact: true })).toHaveValue(
    '0.10',
  );
  await expect(page.locator('.payment-dialog-balance')).toContainText('٠٫١٠');
  await confirmPayment(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(
    (await paymentModel.findOne({ invoice: id }).orFail()).entries,
  ).toHaveLength(1);
  await recordPayment(page, '0.10');
  expect(keys[2]).not.toBe(keys[0]);
  expect(
    (await paymentModel.findOne({ invoice: id }).orFail()).entries,
  ).toHaveLength(2);
});
test('PAY-001 precommit failure requires a read and explicit confirmation reuses the original key', async ({
  page,
}) => {
  const { id } = await paymentInvoice(page),
    keys: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname ===
        '/api/v1/invoices/' + id + '/payments' &&
      request.method() === 'POST'
    )
      keys.push(request.postDataJSON().requestId);
  });
  await page.route('**/api/v1/invoices/' + id + '/payments', (route) =>
    route.request().method() === 'POST'
      ? route.abort('failed')
      : route.continue(),
  );
  await openPayment(page, '0.10');
  await confirmPayment(page);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'مش مؤكدة',
  );
  expect(await paymentModel.countDocuments()).toBe(0);
  await page.unrouteAll({ behavior: 'wait' });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'قراءة سجل الدفعات الحالي', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'تأكيد تسجيل الدفعة', exact: true }),
  ).toBeEnabled();
  await confirmPayment(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(
    (await paymentModel.findOne({ invoice: id }).orFail()).entries,
  ).toHaveLength(1);
});
test('PAY-001 stale balances retain input until reread and a corrected amount uses current revision', async ({
  page,
}) => {
  const { id, workspace } = await paymentInvoice(page);
  await openPayment(page, '0.20');
  await createPayments(paymentModel, invoiceModels.Invoice, () => shareNow).add(
    workspace.id,
    id,
    0,
    {
      requestId: randomUUID(),
      amount: '0.20',
      paidOn: shareNow.toISOString().slice(0, 10),
      method: 'cash',
      reference: 'elsewhere',
      memo: '',
    },
  );
  await confirmPayment(page);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'اتغير',
  );
  await expect(page.getByLabel('المبلغ (EGP)', { exact: true })).toHaveValue(
    '0.20',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'قراءة سجل الدفعات الحالي', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'تأكيد تسجيل الدفعة', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.payment-dialog-balance')).toContainText('٠٫١٠');
  await page.getByLabel('المبلغ (EGP)', { exact: true }).fill('0.10');
  await confirmPayment(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.payment-balance')).toHaveAttribute(
    'data-payment-status',
    'paid',
  );
  expect((await paymentModel.findOne({ invoice: id }).orFail()).version).toBe(
    2,
  );
});
test('PAY-001 lost correction response requires reread and preserves original reason and history', async ({
  page,
}) => {
  const { id } = await paymentInvoice(page);
  await recordPayment(page, '0.10');
  let writes = 0;
  await page.route(
    '**/api/v1/invoices/' + id + '/payments/*/void',
    async (route) => {
      writes++;
      await route.fetch();
      await route.abort('failed');
    },
  );
  await page
    .locator('.payment-entries')
    .getByRole('button', { name: 'إلغاء أثر الدفعة', exact: true })
    .click();
  await page
    .getByLabel('سبب الإلغاء', { exact: true })
    .fill('خطأ في إدخال الدفعة');
  const confirmation24 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'تأكيد إلغاء الأثر', exact: true })
    .click();
  await confirmation24;
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'مش مؤكدة',
  );
  await page.getByRole('dialog').locator('form').dispatchEvent('submit');
  expect(writes).toBe(1);
  await page.unrouteAll({ behavior: 'wait' });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'قراءة سجل الدفعات الحالي', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'تأكيد إلغاء الأثر', exact: true }),
  ).toBeEnabled();
  const confirmation25 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'تأكيد إلغاء الأثر', exact: true })
    .click();
  await confirmation25;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.payment-entries li')).toContainText(
    'خطأ في إدخال الدفعة',
  );
  await expect(page.locator('.payment-balance')).toHaveAttribute(
    'data-payment-status',
    'unpaid',
  );
  expect((await paymentModel.findOne({ invoice: id }).orFail()).version).toBe(
    2,
  );
});
test('PAY-001 precise validation and session renewal prevent invalid or duplicate payments', async ({
  page,
}) => {
  const { id } = await paymentInvoice(page);
  await openPayment(page, '0.001');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'تأكيد تسجيل الدفعة', exact: true })
    .click();
  await expect(page.locator('#payment-amount-error')).toBeVisible();
  expect(await paymentModel.countDocuments()).toBe(0);
  await page.getByLabel('المبلغ (EGP)', { exact: true }).fill('0.31');
  await confirmPayment(page);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'أكبر من المتبقي',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'قراءة سجل الدفعات الحالي', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'تأكيد تسجيل الدفعة', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('المبلغ (EGP)', { exact: true }).fill('0.10');
  now = new Date(now.getTime() + 16 * 60_000);
  await confirmPayment(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    (await paymentModel.findOne({ invoice: id }).orFail()).entries,
  ).toHaveLength(1);
  await expect(page.getByTestId('paid-balance')).toContainText('٠٫١٠');
});
test('PAY-001 zero issued invoice is settled without fabricated payment records', async ({
  page,
}) => {
  await prepareInvoice(page);
  await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('0.00');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
  await issueInvoiceInBrowser(page);
  await expect(page.locator('.payment-balance')).toHaveAttribute(
    'data-payment-status',
    'paid',
  );
  await expect(page.locator('.payment-empty')).toContainText(
    'مفيش دفعة مطلوبة',
  );
  await expect(
    page
      .locator('.payment-ledger')
      .getByRole('button', { name: 'تسجيل دفعة', exact: true }),
  ).toHaveCount(0);
  expect(await paymentModel.countDocuments()).toBe(0);
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(
    'responsive audit PAY-001 payment balances, received records and corrections ' +
      viewport.width,
    async ({ page }, testInfo) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      const layout = async (screen: string) =>
        expect(
          (
            await inspectResponsiveLayout(
              page,
              screen,
              viewport.width <= 960,
              viewport.width,
            )
          ).issues,
          screen,
        ).toEqual([]);
      const { id } = await paymentInvoice(page, '1000000000.00');
      await layout('issued-empty-payment-ledger');
      await openPayment(page, '0.001');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'تأكيد تسجيل الدفعة', exact: true })
        .click();
      await expect(page.locator('#payment-amount-error')).toBeVisible();
      await layout('payment-validation-dialog');
      await page
        .getByLabel('المبلغ (EGP)', { exact: true })
        .fill('999999999.80');
      await page
        .getByLabel('مرجع الدفعة', { exact: false })
        .fill('Reference'.repeat(11));
      await page
        .getByLabel('ملاحظة', { exact: false })
        .fill('https://example.com/' + 'a'.repeat(480));
      await layout('long-payment-editor');
      await confirmPayment(page);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await layout('partial-paid-private-ledger');
      await recordPayment(page, '0.20');
      await expect(page.locator('.payment-balance')).toHaveAttribute(
        'data-payment-status',
        'paid',
      );
      await layout('fully-paid-private-ledger');
      await page.screenshot({
        path: testInfo.outputPath('invoice-payments.png'),
        fullPage: true,
        animations: 'disabled',
      });
      await page
        .locator('.payment-entries li')
        .first()
        .getByRole('button', { name: 'إلغاء أثر الدفعة', exact: true })
        .click();
      await expect(
        page
          .getByRole('dialog')
          .getByRole('button', { name: 'رجوع', exact: true }),
      ).toBeFocused();
      await page
        .getByLabel('سبب الإلغاء', { exact: true })
        .fill('سبب'.repeat(90));
      await layout('long-payment-correction');
      const confirmation26 = respondToAppConfirmation(page, (dialog) =>
        dialog.accept(),
      );
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'تأكيد إلغاء الأثر', exact: true })
        .click();
      await confirmation26;
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('.payment-balance')).toHaveAttribute(
        'data-payment-status',
        'partially_paid',
      );
      await layout('corrected-ledger-with-history');
      await page.reload();
      await expect(page.locator('.payment-entries li')).toHaveCount(2);
      expect(
        (await paymentModel.findOne({ invoice: id }).orFail()).version,
      ).toBe(3);
    },
  );
}

async function seedOverviewTasks(scope: string, clientId: string) {
  const project = await createProjects(
    database,
    projectModel,
    clientModel,
  ).create(scope, { clientId, title: 'مشروع توزيع المهام', summary: '' });
  const tasks = createTasks(
    database,
    taskBoardModel,
    projectModel,
    () => shareNow,
  );
  let board = await tasks.read(scope, project.id);
  for (let index = 0; index < 3; index++)
    board = await tasks.create(scope, project.id, board.version, {
      title: 'مهمة واضحة ' + index,
      description: '',
      priority: 'normal',
    });
  const ids = board.tasks.map((task) => task.id);
  board = await tasks.move(
    scope,
    project.id,
    ids[0]!,
    board.version,
    'in_progress',
    null,
  );
  await tasks.move(scope, project.id, ids[1]!, board.version, 'done', null);
}

async function seedOverview(page: Page, longNotifications = false) {
  await register(page);
  const identity = (await sessions.login.execute(account)).identity;
  const scope = identity.workspace.id;
  const client = await clients.create(scope, {
    name: 'عميل دفتر المتابعة',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });
  const service = createInvoices(
    database,
    invoiceModels,
    clientModel,
    projectModel,
    () => shareNow,
  );
  const payments = createPayments(
    paymentModel,
    invoiceModels.Invoice,
    () => shareNow,
  );
  let first = '';
  for (const currency of ['EGP', 'USD', 'EUR', 'SAR']) {
    const draft = await service.create(scope, {
      requestId: randomUUID(),
      clientId: client.id,
      projectId: null,
      title: longNotifications
        ? 'فاتورة '.repeat(17).slice(0, 120)
        : 'مستحقات شغل',
      summary: '',
      terms: '',
      currency,
      items: [{ title: 'شغل', quantity: 1, unitPrice: '1000000000.00' }],
    });
    const record = await service.issue(
      scope,
      draft.id,
      1,
      identity.workspace.name,
    );
    await payments.add(scope, record.id, 0, {
      requestId: randomUUID(),
      amount: '999999999.99',
      paidOn: shareNow.toISOString().slice(0, 10),
      method: 'cash',
      reference: '',
      memo: '',
    });
    if (!first) first = record.id;
  }
  const proposal = await proposals.create(scope, {
    clientId: client.id,
    title: ('https://example.com/' + 'a'.repeat(120)).slice(0, 120),
    summary: '',
    terms: '',
    currency: 'EGP',
    items: [{ title: 'Work', quantity: 1, unitPrice: '10.00' }],
  });
  await createProposalSharing(proposalModel, () => shareNow).issue(
    scope,
    identity.workspace.name,
    proposal.id,
    proposal.version,
    1,
  );
  await page.reload();
  await expect(page.locator('.overview-currency')).toHaveCount(4);
  return { scope, first, payments, clientId: client.id };
}
test('DSH-001 real balances update after a payment correction and survive reload', async ({
  page,
}) => {
  const { scope, first, payments } = await seedOverview(page);
  const egp = page.getByRole('article', { name: 'رصيد EGP', exact: true });
  await expect(egp.locator('dd').last()).toHaveText(
    formatOverviewMoney('1', 'EGP'),
  );
  const ledger = await payments.read(scope, first);
  await payments.void(
    scope,
    first,
    ledger.payments[0]!.id,
    ledger.version,
    'تصحيح الدفعة',
  );
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(egp.locator('dd').last()).toHaveText(
    formatOverviewMoney('100000000000', 'EGP'),
  );
  await page.reload();
  await expect(egp.locator('dd').last()).toHaveText(
    formatOverviewMoney('100000000000', 'EGP'),
  );
  await page
    .locator('.overview-counts')
    .getByRole('link', { name: 'فواتير صادرة' })
    .click();
  await expect(page).toHaveURL('/invoices');
});
test('DSH-001 failed initial read and refresh hide numbers and recover explicitly without loops', async ({
  page,
}) => {
  let failed = true,
    reads = 0;
  await page.route('**/api/v1/dashboard', (route) => {
    reads++;
    return failed
      ? route.fulfill({
          status: 503,
          json: { success: false, error: { code: 'SERVER_ERROR' } },
        })
      : route.continue();
  });
  await register(page);
  await expect(page.locator('.work-overview').getByRole('alert')).toBeVisible();
  expect(await page.locator('.overview-counts').count()).toBe(0);
  const count = reads;
  await page.waitForTimeout(300);
  expect(reads).toBe(count);
  failed = false;
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(page.locator('.overview-counts')).toBeVisible();
  await expect(page.locator('.overview-empty').first()).toContainText(
    'لسه مفيش',
  );
  failed = true;
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(page.locator('.work-overview').getByRole('alert')).toBeVisible();
  expect(await page.locator('.overview-counts').count()).toBe(0);
  failed = false;
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(page.locator('.overview-counts')).toBeVisible();
});
test('DSH-001 explicit read renews expired access once and signs out on expired session', async ({
  page,
}) => {
  await register(page);
  await expect(page.locator('.overview-counts')).toBeVisible();
  now = new Date(now.getTime() + 901000);
  let renewals = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/auth/refresh')) renewals++;
  });
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(page.locator('.overview-counts')).toBeVisible();
  expect(renewals).toBe(1);
  now = new Date(now.getTime() + 8 * 86400000);
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(page).toHaveURL('/login');
  expect(await page.locator('.overview-counts').count()).toBe(0);
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(
    'responsive audit DSH-001 scoped counts, four currencies and real link deadlines ' +
      viewport.width,
    async ({ page }, testInfo) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      await register(page);
      await expect(page.locator('.overview-counts')).toBeVisible();
      await finishEntrance(page);
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'overview-empty',
            viewport.width <= 960,
            viewport.width,
          )
        ).issues,
      ).toEqual([]);
      await page.locator('.overview-guide > summary').click();
      await expect(page.locator('#overview-guide-content')).toBeVisible();
      await finishEntrance(page);
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'overview-open-guide',
            viewport.width <= 960,
            viewport.width,
          )
        ).issues,
      ).toEqual([]);
      // Reuse the same authenticated workspace rather than registering a second time.
      const identity = (await sessions.login.execute(account)).identity;
      const scope = identity.workspace.id;
      const client = await clients.create(scope, {
        name: 'عميل الملخص',
        email: '',
        phone: '',
        company: '',
        notes: '',
      });
      await seedOverviewTasks(scope, client.id);
      const service = createInvoices(
        database,
        invoiceModels,
        clientModel,
        projectModel,
        () => shareNow,
      );
      for (const currency of ['EGP', 'USD', 'EUR', 'SAR']) {
        const draft = await service.create(scope, {
          requestId: randomUUID(),
          clientId: client.id,
          projectId: null,
          title: 'شغل',
          summary: '',
          terms: '',
          currency,
          items: [{ title: 'شغل', quantity: 1, unitPrice: '1000000000.00' }],
        });
        await service.issue(scope, draft.id, 1, identity.workspace.name);
      }
      const proposal = await proposals.create(scope, {
        clientId: client.id,
        title: ('https://example.com/' + 'a'.repeat(120)).slice(0, 120),
        summary: '',
        terms: '',
        currency: 'EGP',
        items: [{ title: 'شغل', quantity: 1, unitPrice: '10.00' }],
      });
      await createProposalSharing(proposalModel, () => shareNow).issue(
        scope,
        identity.workspace.name,
        proposal.id,
        proposal.version,
        1,
      );
      await page
        .getByRole('button', { name: 'تحديث الأرقام', exact: true })
        .click();
      await expect(page.locator('.overview-currency')).toHaveCount(4);
      await expect(page.locator('.overview-deadlines li')).toHaveCount(1);
      await finishEntrance(page);
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'overview-populated',
            viewport.width <= 960,
            viewport.width,
          )
        ).issues,
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath('workspace-overview.png'),
        fullPage: true,
        animations: 'disabled',
      });
      await page.route('**/api/v1/dashboard', (route) =>
        route.fulfill({
          status: 503,
          json: { success: false, error: { code: 'SERVER_ERROR' } },
        }),
      );
      await page
        .getByRole('button', { name: 'تحديث الأرقام', exact: true })
        .click();
      await expect(
        page.locator('.work-overview').getByRole('alert'),
      ).toBeVisible();
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'overview-read-error',
            viewport.width <= 960,
            viewport.width,
          )
        ).issues,
      ).toEqual([]);
    },
  );
}

test('DSH-001 large currency formatting preserves the last cent beyond safe integers', () => {
  for (const currency of ['EGP', 'USD', 'EUR', 'SAR']) {
    expect(
      formatOverviewMoney('9007300000000001', currency).replace(
        /[^\u0660-\u0669\u066B\u066C]/gu,
        '',
      ),
    ).toBe('٩٠٬٠٧٣٬٠٠٠٬٠٠٠٬٠٠٠٫٠١');
    expect(formatOverviewMoney('1', currency)).toBe(
      new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(0.01),
    );
  }
});
test('DSH-001 simultaneous refresh clicks share one read and malformed responses hide figures', async ({
  page,
}) => {
  await register(page);
  await expect(page.locator('.overview-counts')).toBeVisible();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route('**/api/v1/dashboard', async (route) => {
    reads++;
    await held;
    await route.continue();
  });
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .evaluate((button) => {
      if (!(button instanceof HTMLButtonElement))
        throw new Error('Expected refresh button');
      button.click();
      button.click();
    });
  await expect(page.locator('.overview-counts')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'جارٍ القراءة…', exact: true }),
  ).toBeDisabled();
  await expect.poll(() => reads).toBe(1);
  release();
  await expect(page.locator('.overview-counts')).toBeVisible();
  expect(reads).toBe(1);
  await page.unroute('**/api/v1/dashboard');
  await page.route('**/api/v1/dashboard', (route) =>
    route.fulfill({ json: { success: true, data: {} } }),
  );
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(page.locator('.work-overview').getByRole('alert')).toBeVisible();
  await expect(page.locator('.overview-counts')).toHaveCount(0);
});
test('DSH-001 a late old workspace read cannot appear after logout and another account login', async ({
  page,
}) => {
  await seedOverview(page);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route('**/api/v1/dashboard', async (route) => {
    const response = await route.fetch();
    started = true;
    await held;
    await route.fulfill({ response }).catch(() => undefined);
  });
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.unroute('**/api/v1/dashboard');
  const other = {
    ...account,
    name: 'مريم',
    email: 'other-overview@example.com',
    workspaceName: 'دفتر مريم',
  };
  await registerAccount.execute(other);
  await page.getByLabel('البريد الإلكتروني').fill(other.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(other.password);
  await page.getByRole('button', { name: 'دخول لمساحتك' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('.overview-counts')).toBeVisible();
  await expect(page.locator('.overview-currency')).toHaveCount(0);
  await expect(
    page.locator('.overview-counts article').first().locator('strong'),
  ).toHaveText('٠');
  release();
  await page.waitForTimeout(300);
  await expect(page.locator('.overview-currency')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('مريم');
});

async function preparePortal(page: Page, stress = false, paging = false) {
  await register(page);
  const identity = (await sessions.login.execute(account)).identity,
    scope = identity.workspace.id;
  const target = await clients.create(scope, {
    name: stress ? 'اسم عميل طويل '.repeat(5) : 'عميل بوابة المتابعة',
    company: 'شركة الشغل',
    email: 'PRIVATE@example.com',
    phone: '+201012345678',
    notes: 'PRIVATE CLIENT NOTES',
  });
  const projects = createProjects(database, projectModel, clientModel),
    tasks = createTasks(database, taskBoardModel, projectModel, () => shareNow),
    invoices = createInvoices(
      database,
      invoiceModels,
      clientModel,
      projectModel,
      () => shareNow,
    ),
    payments = createPayments(
      paymentModel,
      invoiceModels.Invoice,
      () => shareNow,
    );
  let projectId = '',
    invoiceId = '';
  for (let i = 0; i < (paging ? 7 : 1); i++) {
    const project = await projects.create(scope, {
      clientId: target.id,
      title: stress
        ? ('https://example.com/' + 'a'.repeat(120)).slice(0, 120)
        : 'مشروع البوابة ' + i,
      summary: stress
        ? 'https://example.com/' + 'a'.repeat(1000)
        : 'تنفيذ الشغل المتفق عليه',
    });
    let board = await tasks.create(scope, project.id, 0, {
      title: 'PRIVATE TASK',
      description: 'PRIVATE TASK DESCRIPTION',
      priority: 'high',
    });
    board = await tasks.create(scope, project.id, board.version, {
      title: stress ? 'مهمة ظاهرة '.repeat(10) : 'المهمة الظاهرة ' + i,
      description: stress
        ? 'https://example.com/' + 'b'.repeat(1500)
        : 'تفاصيل يقدر العميل يتابعها',
      priority: 'normal',
    });
    await tasks.setClientVisibility(
      scope,
      project.id,
      board.tasks[1]!.id,
      board.version,
      true,
    );
    const draft = await invoices.create(scope, {
      requestId: randomUUID(),
      clientId: target.id,
      projectId: project.id,
      title: stress ? 'عنوان فاتورة '.repeat(8) : 'فاتورة البوابة ' + i,
      summary: 'PRIVATE INVOICE SUMMARY',
      terms: 'PRIVATE INVOICE TERMS',
      currency: i % 2 === 0 ? 'EGP' : 'USD',
      items: [
        {
          title: 'شغل',
          quantity: 1,
          unitPrice: stress ? '1000000000.00' : '10.00',
        },
      ],
    });
    const issued = await invoices.issue(
      scope,
      draft.id,
      1,
      identity.workspace.name,
    );
    await payments.add(scope, issued.id, 0, {
      requestId: randomUUID(),
      amount: stress ? '999999999.99' : '3.00',
      paidOn: shareNow.toISOString().slice(0, 10),
      method: 'cash',
      reference: 'PRIVATE REF',
      memo: 'PRIVATE MEMO',
    });
    if (!projectId) {
      projectId = project.id;
      invoiceId = issued.id;
    }
  }
  const other = await clients.create(scope, {
    name: 'OTHER CLIENT',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });
  await projects.create(scope, {
    clientId: other.id,
    title: 'OTHER CLIENT PROJECT',
    summary: 'OTHER CLIENT SECRET',
  });
  await page.goto('/clients');
  await expect(page.locator('.client-row')).toHaveCount(2);
  await page
    .getByRole('link', { name: 'بوابة متابعة ' + target.name, exact: true })
    .click();
  await expect(page).toHaveURL('/clients/' + target.id + '/portal');
  await expect(page.locator('.portal-preview')).toBeVisible();
  return {
    scope,
    clientId: target.id,
    projectId,
    invoiceId,
    target,
    projects,
    tasks,
    payments,
  };
}
async function issuePortal(page: Page, renew = false) {
  await page.getByLabel('راجعت المعاينة وموافق أشارك نطاق البوابة ده').check();
  const confirmation27 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', {
      name: renew ? 'تجديد رابط المتابعة' : 'إنشاء رابط المتابعة',
      exact: true,
    })
    .click();
  await confirmation27;
  await expect(page.locator('#portal-link')).toBeVisible();
  return page.locator('#portal-link').inputValue();
}
test('PRT-001 reviewed portal shares real work, visible tasks and balances without private details', async ({
  page,
  context,
}) => {
  const { scope, projectId, tasks } = await preparePortal(page);
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط المتابعة', exact: true }),
  ).toBeDisabled();
  expect(await portalModel.countDocuments()).toBe(0);
  await expect(page.locator('.portal-preview')).not.toContainText('PRIVATE');
  await expect(page.locator('.portal-preview')).not.toContainText(
    'OTHER CLIENT',
  );
  const link = await issuePortal(page),
    publicPage = await context.newPage();
  const writes: string[] = [];
  publicPage.on('request', (req) => {
    if (req.url().includes('localhost:5100')) {
      expect(req.url()).not.toContain(link.split('#')[1]);
      writes.push(new URL(req.url()).pathname);
    }
  });
  await publicPage.goto(link);
  await expect(publicPage.locator('.portal-project')).toHaveCount(1);
  await expect(publicPage.locator('.portal-invoice')).toHaveCount(1);
  await expect(publicPage.locator('.portal-tasks li')).toHaveCount(1);
  await expect(publicPage.locator('.portal-document')).not.toContainText(
    'PRIVATE',
  );
  await expect(publicPage.locator('.portal-document')).not.toContainText(
    'OTHER CLIENT',
  );
  await expect(publicPage.locator('.portal-invoice dd').last()).toHaveText(
    new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 2,
    }).format(7),
  );
  expect(writes.every((path) => path === '/api/v1/public/portal/read')).toBe(
    true,
  );
  const board = await tasks.read(scope, projectId);
  await tasks.setClientVisibility(
    scope,
    projectId,
    board.tasks[1]!.id,
    board.version,
    false,
  );
  await publicPage
    .getByRole('button', { name: 'تحديث والرجوع لأول صفحة', exact: true })
    .click();
  await expect(publicPage.locator('.portal-tasks li')).toHaveCount(0);
  await expect(publicPage.locator('.portal-progress')).toContainText(
    'لسه مفيش مهام ظاهرة',
  );
});
test('PRT-001 grant renewal invalidates old links and revocation keeps financial documents unchanged', async ({
  page,
  context,
}) => {
  const { clientId } = await preparePortal(page),
    link = await issuePortal(page),
    publicPage = await context.newPage();
  await publicPage.goto(link);
  await expect(publicPage.locator('.portal-document')).toBeVisible();
  const invoices = await invoiceModels.Invoice.find().lean();
  const renewed = await issuePortal(page, true);
  expect(renewed).not.toBe(link);
  await publicPage.reload();
  await expect(
    publicPage.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
  ).toBeVisible();
  await publicPage.goto(renewed);
  await expect(publicPage.locator('.portal-document')).toBeVisible();
  const confirmation28 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'إلغاء رابط المتابعة', exact: true })
    .click();
  await confirmation28;
  await expect(page.locator('.portal-state')).toContainText('الرابط ملغي');
  await publicPage.reload();
  await expect(publicPage.locator('.portal-document')).toHaveCount(0);
  expect(await invoiceModels.Invoice.find().lean()).toEqual(invoices);
  expect(
    (await portalModel.findOne({ client: clientId }).orFail()).version,
  ).toBe(3);
});
test('PRT-001 bounded independent paging and explicit read recovery preserve client scope', async ({
  page,
  context,
}) => {
  await preparePortal(page, false, true);
  await expect(page.locator('.portal-preview .portal-project')).toHaveCount(5);
  await page
    .locator('.portal-preview')
    .getByRole('button', { name: 'المزيد من المشاريع', exact: true })
    .click();
  await expect(page.locator('.portal-preview .portal-project')).toHaveCount(2);
  await expect(
    page.getByLabel('راجعت المعاينة وموافق أشارك نطاق البوابة ده'),
  ).not.toBeChecked();
  const link = await issuePortal(page),
    publicPage = await context.newPage();
  await publicPage.goto(link);
  await expect(publicPage.locator('.portal-project')).toHaveCount(5);
  await publicPage
    .getByRole('button', { name: 'المزيد من المشاريع', exact: true })
    .click();
  await expect(publicPage.locator('.portal-project')).toHaveCount(2);
  await expect(publicPage.locator('.portal-invoice')).toHaveCount(5);
  await publicPage
    .getByRole('button', { name: 'المزيد من الفواتير', exact: true })
    .click();
  await expect(publicPage.locator('.portal-project')).toHaveCount(2);
  await expect(publicPage.locator('.portal-invoice')).toHaveCount(2);
  await expect(publicPage.locator('.portal-document')).not.toContainText(
    'OTHER CLIENT',
  );
  await publicPage
    .getByRole('button', { name: 'تحديث والرجوع لأول صفحة', exact: true })
    .click();
  await expect(publicPage.locator('.portal-project')).toHaveCount(5);
  await expect(publicPage.locator('.portal-invoice')).toHaveCount(5);
});
test('PRT-001 lost issuance response blocks automatic replay and recovers through explicit current read', async ({
  page,
}) => {
  const { clientId } = await preparePortal(page);
  let writes = 0;
  await page.route(
    '**/api/v1/clients/' + clientId + '/portal',
    async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      writes++;
      await route.fetch();
      await route.abort();
    },
  );
  await page.getByLabel('راجعت المعاينة وموافق أشارك نطاق البوابة ده').check();
  const confirmation29 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'إنشاء رابط المتابعة', exact: true })
    .evaluate((button) => {
      if (!(button instanceof HTMLButtonElement))
        throw new Error('Expected portal button');
      button.click();
      button.click();
    });
  await confirmation29;
  await expect(
    page.locator('.portal-controls').getByRole('alert'),
  ).toContainText('مش مؤكدة');
  await expect(page.locator('#portal-link')).toHaveCount(0);
  expect(writes).toBe(1);
  expect((await portalModel.findOne().orFail()).version).toBe(1);
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط المتابعة', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/api/v1/clients/' + clientId + '/portal');
  await page
    .getByRole('button', { name: 'قراءة حالة البوابة', exact: true })
    .click();
  await expect(page.locator('.portal-state')).toContainText('الرابط شغال');
  await issuePortal(page, true);
  expect((await portalModel.findOne().orFail()).version).toBe(2);
});
test('PRT-001 stale grant revisions need explicit review and archived clients close public access', async ({
  page,
  context,
}) => {
  const { clientId, scope } = await preparePortal(page),
    link = await issuePortal(page);
  const portal = createPortal(
    database,
    portalModel,
    {
      clients: clientModel.collection.name,
      workspaces: models.Workspace.collection.name,
      projects: projectModel.collection.name,
      tasks: taskBoardModel.collection.name,
      invoices: invoiceModels.Invoice.collection.name,
      payments: paymentModel.collection.name,
    },
    () => shareNow,
  );
  await portal.issue(scope, clientId, 1, 7);
  await page.getByLabel('راجعت المعاينة وموافق أشارك نطاق البوابة ده').check();
  const confirmation30 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await page
    .getByRole('button', { name: 'تجديد رابط المتابعة', exact: true })
    .click();
  await confirmation30;
  await expect(
    page.locator('.portal-controls').getByRole('alert'),
  ).toContainText('اتغيرت');
  await page
    .getByRole('button', { name: 'قراءة حالة البوابة', exact: true })
    .click();
  await expect(
    page.getByLabel('راجعت المعاينة وموافق أشارك نطاق البوابة ده'),
  ).not.toBeChecked();
  const renewed = await issuePortal(page, true);
  expect(renewed).not.toBe(link);
  await clientModel.updateOne(
    { _id: clientId },
    { $set: { archivedAt: shareNow } },
  );
  const publicPage = await context.newPage();
  await publicPage.goto(renewed);
  await expect(
    publicPage.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'قراءة حالة البوابة', exact: true })
    .click();
  await expect(page.locator('.portal-controls')).toContainText('العميل مؤرشف');
  await expect(
    page.getByRole('button', { name: 'تجديد رابط المتابعة', exact: true }),
  ).toBeDisabled();
});
test('PRT-001 public expiry and restored-page network failures remove previous data without retry loops', async ({
  page,
  context,
}) => {
  await preparePortal(page);
  const link = await issuePortal(page),
    secret = link.split('#')[1]!,
    publicPage = await context.newPage();
  await publicPage.route('**/public/portal/read', async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const body = await response.json();
    body.data.validForSeconds = 1;
    await route.fulfill({ response, json: body });
  });
  await publicPage.goto(link);
  await expect(publicPage.locator('.portal-document')).toBeVisible();
  shareNow = new Date(shareNow.getTime() + 8 * 86400000);
  await expect(
    publicPage.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
  ).toBeVisible();
  await expect(publicPage.locator('.portal-document')).toHaveCount(0);
  await publicPage.unroute('**/public/portal/read');
  shareNow = new Date();
  expect(
    (await portalModel.findOne().orFail()).expiresAt.getTime(),
  ).toBeGreaterThan(shareNow.getTime());
  await publicPage.reload();
  await expect(publicPage.locator('.portal-document')).toBeVisible();
  let reads = 0,
    failed = true;
  await publicPage.route('**/public/portal/read', (route) => {
    reads++;
    return failed
      ? route.fulfill({
          status: 503,
          json: { success: false, error: { code: 'SERVER_ERROR' } },
        })
      : route.continue();
  });
  await publicPage.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  );
  await expect(
    publicPage.getByRole('heading', {
      name: 'مش قادرين نفتح البوابة دلوقتي',
      exact: true,
    }),
  ).toBeVisible();
  await expect(publicPage.locator('.portal-document')).toHaveCount(0);
  const readCount = reads;
  await publicPage.waitForTimeout(300);
  expect(reads).toBe(readCount);
  failed = false;
  await publicPage
    .getByRole('button', { name: 'إعادة المحاولة', exact: true })
    .click();
  await expect(publicPage.locator('.portal-document')).toBeVisible();
  expect((await portalModel.findOne().orFail()).digest).not.toBe(secret);
});
test('PRT-001 a late hash response cannot restore an old client portal', async ({
  page,
  context,
}) => {
  await preparePortal(page);
  const link = await issuePortal(page),
    publicPage = await context.newPage();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await publicPage.route('**/public/portal/read', async (route) => {
    if (route.request().postDataJSON().token !== link.split('#')[1])
      return route.continue();
    const response = await route.fetch();
    started = true;
    await held;
    await route.fulfill({ response }).catch(() => undefined);
  });
  await publicPage.goto(link);
  await expect.poll(() => started).toBe(true);
  await publicPage.evaluate(() => {
    window.location.hash = 'A'.repeat(43);
  });
  await expect(
    publicPage.getByRole('heading', { name: 'الرابط غير متاح', exact: true }),
  ).toBeVisible();
  release();
  await publicPage.waitForTimeout(300);
  await expect(publicPage.locator('.portal-document')).toHaveCount(0);
});
test('PRT-001 private read failure recovers explicitly and grant writes renew the session once', async ({
  page,
}) => {
  const { clientId } = await preparePortal(page);
  let failed = true;
  await page.route('**/api/v1/clients/' + clientId + '/portal', (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { success: false, error: { code: 'SERVER_ERROR' } },
        })
      : route.continue(),
  );
  await page.reload();
  await expect(
    page.locator('.portal-controls').getByRole('alert'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'إنشاء رابط المتابعة', exact: true }),
  ).toBeDisabled();
  failed = false;
  await page
    .getByRole('button', { name: 'قراءة حالة البوابة', exact: true })
    .click();
  await expect(page.locator('.portal-preview')).toBeVisible();
  now = new Date(now.getTime() + 901000);
  let renewals = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/auth/refresh')) renewals++;
  });
  await issuePortal(page);
  expect(renewals).toBe(1);
  expect(await portalModel.countDocuments()).toBe(1);
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(
    'responsive audit PRT-001 client entry, owner review, public work and balances ' +
      viewport.width,
    async ({ page, context }, testInfo) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      const { clientId } = await preparePortal(page, true);
      const layout = async (target: Page, name: string) => {
        await finishEntrance(target);
        expect(
          (
            await inspectResponsiveLayout(
              target,
              name,
              viewport.width <= 960,
              viewport.width,
            )
          ).issues,
          name,
        ).toEqual([]);
      };
      await layout(page, 'portal-owner-preview');
      await page.goto('/clients');
      await expect(page.locator('.client-row')).toHaveCount(2);
      await layout(page, 'client-portal-entry');
      await page.goto('/clients/' + clientId + '/portal');
      await expect(page.locator('.portal-preview')).toBeVisible();
      const link = await issuePortal(page);
      await layout(page, 'portal-owner-created-link');
      const publicPage = await context.newPage();
      await publicPage.setViewportSize(viewport);
      await publicPage.emulateMedia({
        reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference',
      });
      await publicPage.goto(link);
      await expect(publicPage.locator('.portal-document')).toBeVisible();
      await layout(publicPage, 'portal-public-long-work');
      await publicPage.screenshot({
        path: testInfo.outputPath('client-portal.png'),
        fullPage: true,
        animations: 'disabled',
      });
      const confirmation31 = respondToAppConfirmation(page, (dialog) =>
        dialog.accept(),
      );
      await page
        .getByRole('button', { name: 'إلغاء رابط المتابعة', exact: true })
        .click();
      await confirmation31;
      await expect(page.locator('.portal-state')).toContainText('الرابط ملغي');
      await layout(page, 'portal-owner-revoked');
      await publicPage.reload();
      await expect(
        publicPage.getByRole('heading', {
          name: 'الرابط غير متاح',
          exact: true,
        }),
      ).toBeVisible();
      await layout(publicPage, 'portal-public-revoked');
    },
  );
}

test('DSH-001 overview guide explains stages with keyboard, preserves exact balances and respects reduced motion', async ({
  page,
}) => {
  const { scope, clientId } = await seedOverview(page);
  await seedOverviewTasks(scope, clientId);
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(page.locator('.overview-task-counts dd')).toHaveText([
    '١',
    '١',
    '١',
  ]);
  await expect(page.locator('.task-segment')).toHaveCount(3);
  const egp = page.getByRole('article', { name: 'رصيد EGP', exact: true });
  const before = await egp.locator('dd').allTextContents();
  let reads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/dashboard')) reads++;
  });
  const guide = page.locator('.overview-guide');
  await guide.locator('summary').press('Enter');
  await expect(page.locator('#overview-guide-content')).toContainText(
    'مين هتشتغل معاه؟',
  );
  const invoices = guide.getByRole('button', { name: 'الفواتير', exact: true });
  await invoices.focus();
  await invoices.press('Enter');
  await expect(invoices).toBeFocused();
  await expect(invoices).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#overview-guide-content')).toContainText(
    'كل عملة في حساب منفصل',
  );
  await page.locator('.overview-explainer summary').click();
  await expect(page.locator('.overview-explainer')).toContainText(
    'المسودات مش داخلة في الحساب',
  );
  expect(await egp.locator('dd').allTextContents()).toEqual(before);
  expect(reads).toBe(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await guide.getByRole('button', { name: 'المشاريع', exact: true }).click();
  await expect(page.locator('#overview-guide-content')).toContainText(
    'حالة المشروع مستقلة عن المهام',
  );
  await expect(page.locator('.overview-guide-explanation')).toHaveCSS(
    'animation-name',
    'none',
  );
  await expect(page.locator('.task-segment').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  await guide.getByRole('button', { name: 'الفواتير', exact: true }).click();
  await guide.getByRole('link', { name: 'راجع الفواتير', exact: true }).click();
  await expect(page).toHaveURL('/invoices');
});

async function seedNotifications(page: Page, count = 1, long = false) {
  await register(page);
  const identity = (await sessions.login.execute(account)).identity;
  const scope = identity.workspace.id;
  const client = await clients.create(scope, {
    name: 'عميل المستجدات',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });
  const service = createInvoices(
    database,
    invoiceModels,
    clientModel,
    projectModel,
    () => shareNow,
  );
  let first = '';
  for (let index = 0; index < count; index++) {
    const draft = await service.create(scope, {
      requestId: randomUUID(),
      clientId: client.id,
      projectId: null,
      title: long
        ? ('تفاصيل شغل ' + 'x'.repeat(120)).slice(0, 120)
        : 'فاتورة المستجدات ' + index,
      summary: '',
      terms: '',
      currency: 'EGP',
      items: [{ title: 'شغل', quantity: 1, unitPrice: '100.00' }],
    });
    const issued = await service.issue(
      scope,
      draft.id,
      1,
      identity.workspace.name,
    );
    if (!first) first = issued.id;
  }
  await page.goto('/notifications');
  await expect(
    page.getByRole('heading', { level: 1, name: 'الإشعارات', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.notification-row')).toHaveCount(
    Math.min(25, count),
  );
  return { scope, first, clientId: client.id, identity };
}

test('notification preview reads real events, preserves receipts and supports keyboard dismissal', async ({
  page,
}) => {
  await seedNotifications(page, 8);
  await page.goto('/dashboard');
  const bell = page.locator('.notification-link');
  await bell.focus();
  await page.keyboard.press('Enter');
  const preview = page.getByRole('dialog', { name: 'الإشعارات', exact: true });
  await expect(preview).toBeVisible();
  await expect(page).toHaveURL('/dashboard');
  await expect(preview.locator('li')).toHaveCount(6);
  await expect(
    preview.getByRole('button', { name: 'إغلاق الإشعارات' }),
  ).toBeFocused();
  expect(await notificationStates.countDocuments()).toBe(0);
  await preview
    .getByRole('button', { name: 'علّم كمقروء', exact: true })
    .first()
    .click();
  await expect(bell).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ٧ غير مقروء',
  );
  await expect(preview.locator('li.is-read')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(bell).toBeFocused();
  await bell.click();
  await expect(preview.locator('li.is-read')).toHaveCount(1);
  await page.locator('.breadcrumb').click();
  await expect(preview).toHaveCount(0);
  await bell.click();
  await preview.getByRole('link', { name: 'عرض كل الإشعارات' }).focus();
  await page.keyboard.press('Tab');
  await expect(preview).toHaveCount(0);
  await bell.click();
  const target = preview.locator('li a').first();
  const href = await target.getAttribute('href');
  await target.click();
  await expect(page).toHaveURL(href!);
  await expect(preview).toHaveCount(0);
  expect(await notificationStates.countDocuments()).toBe(1);
});

test('notification preview recovers a lost write reply before allowing another change', async ({
  page,
}) => {
  await seedNotifications(page, 3);
  await page.goto('/dashboard');
  await page.locator('.notification-link').click();
  const preview = page.getByRole('dialog', { name: 'الإشعارات', exact: true });
  await expect(preview.locator('li')).toHaveCount(3);
  let writes = 0;
  await page.route('**/notifications/*/read', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await preview
    .getByRole('button', { name: 'علّم كمقروء', exact: true })
    .first()
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(preview.getByRole('alert')).toContainText(
    'نتيجة تغيير حالة القراءة محتاجة مراجعة',
  );
  await expect(
    preview.getByRole('button', { name: 'حاول تاني' }),
  ).toBeFocused();
  await expect(preview.locator('li')).toHaveCount(0);
  expect(writes).toBe(1);
  expect(await notificationStates.countDocuments()).toBe(1);
  await page.unroute('**/notifications/*/read');
  await preview.getByRole('button', { name: 'حاول تاني' }).click();
  await expect(preview.locator('li.is-read')).toHaveCount(1);
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ٢ غير مقروء',
  );
});

test('notification preview offers empty and retry states', async ({ page }) => {
  await register(page);
  const bell = page.locator('.notification-link');
  const preview = page.getByRole('dialog', { name: 'الإشعارات', exact: true });
  await bell.click();
  await expect(
    preview.getByRole('heading', { name: 'مفيش إشعارات جديدة لسه' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.route('**/api/v1/notifications?filter=*', (route) =>
    route.abort(),
  );
  await bell.click();
  await expect(preview.getByRole('alert')).toContainText(
    'تعذر تحميل الإشعارات',
  );
  await page.unroute('**/api/v1/notifications?filter=*');
  await preview.getByRole('button', { name: 'حاول تاني' }).click();
  await expect(
    preview.getByRole('heading', { name: 'مفيش إشعارات جديدة لسه' }),
  ).toBeVisible();
  await preview.getByRole('link', { name: 'عرض كل الإشعارات' }).click();
  await expect(page).toHaveURL('/notifications');
});

test('notification preview responsive audit fits long events and the compact dashboard prioritizes real work', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { scope, clientId } = await seedOverview(page, true);
  await seedOverviewTasks(scope, clientId);
  await page.reload();
  const followup = page.getByRole('region', { name: 'متابعة الشغل' });
  await expect(followup).toContainText('٢ مهام لسه مخلصتش');
  await expect(
    followup.getByRole('link', { name: 'راجع أقرب رابط عرض للانتهاء' }),
  ).toHaveAttribute('href', /\/proposals\/[a-f\d]{24}/);
  await expect(page.locator('.hero-art')).toHaveCount(0);
  await expect(page.locator('.module-card')).toHaveCount(4);
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
    [320, 568],
    [320, 256],
  ] as const) {
    await page.setViewportSize({ width, height });
    await finishEntrance(page);
    expect(
      (
        await inspectResponsiveLayout(
          page,
          'compact-dashboard',
          width <= 960,
          width,
        )
      ).issues,
    ).toEqual([]);
    await page.locator('.dashboard-hero').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/dashboard-refined/dashboard-${width}-${height}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await page.locator('.notification-link').click();
    const preview = page.getByRole('dialog', {
      name: 'الإشعارات',
      exact: true,
    });
    await expect(preview.locator('li')).toHaveCount(6);
    const bounds = await preview.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    expect(
      (
        await inspectResponsiveLayout(
          page,
          'notification-preview',
          width <= 960,
          width,
        )
      ).issues,
    ).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/dashboard-refined/notifications-${width}-${height}.png`,
      ),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
  }
});

test('NTF-001 read, unread filtering, persistence and document navigation use real events', async ({
  page,
}) => {
  const { first } = await seedNotifications(page, 2);
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ٢ غير مقروء',
  );
  await expect(
    page
      .locator('.notification-row')
      .first()
      .getByRole('img', { name: 'غير مقروء', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'غير المقروء', exact: true }).click();
  await expect(page.locator('.notification-row')).toHaveCount(2);
  await page
    .locator('.notification-row')
    .first()
    .getByRole('button', { name: 'علّم كمقروء' })
    .click();
  await expect(page.locator('.notification-row')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'غير المقروء', exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('status')).toContainText('الإشعار اتعلّم كمقروء');
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ١ غير مقروء',
  );
  await page.getByRole('button', { name: 'الكل', exact: true }).click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
  await page
    .locator('.notification-row.is-read')
    .getByRole('button', { name: 'اعتبره غير مقروء' })
    .click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(0);
  await page
    .locator('.notification-row')
    .filter({ has: page.locator('a[href="/invoices/' + first + '"]') })
    .getByRole('link', { name: 'افتح الفاتورة' })
    .click();
  await expect(page).toHaveURL('/invoices/' + first);
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ٢ غير مقروء',
  );
});
test('NTF-001 received and voided payment history plus invoice issue remain distinct without duplicates', async ({
  page,
}) => {
  const { scope, first } = await seedNotifications(page);
  const service = createPayments(
    paymentModel,
    invoiceModels.Invoice,
    () => shareNow,
  );
  const input = {
    requestId: randomUUID(),
    amount: '20.00',
    paidOn: shareNow.toISOString().slice(0, 10),
    method: 'cash',
    reference: '',
    memo: '',
  };
  const ledger = await service.add(scope, first, 0, input);
  await service.add(scope, first, 0, input);
  await service.void(
    scope,
    first,
    ledger.payments[0]!.id,
    ledger.version,
    'تصحيح التسجيل',
  );
  await page.getByRole('button', { name: 'قراءة الإشعارات من جديد' }).click();
  await expect(page.locator('.notification-row')).toHaveCount(3);
  await expect(page.locator('.notification-kind')).toHaveText([
    'أثر دفعة اتلغى',
    'دفعة اتسجلت',
    'الفاتورة اتصدرت',
  ]);
});
test('NTF-001 lost write reply blocks duplicate writes until explicit read of the committed state', async ({
  page,
}) => {
  await seedNotifications(page);
  let writes = 0;
  await page.route('**/notifications/*/read', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'علّم كمقروء' }).click();
  await expect(
    page.locator('.notification-inbox').getByRole('alert'),
  ).toContainText('نتيجة تغيير حالة القراءة محتاجة مراجعة');
  await expect(page.locator('.notification-row')).toHaveCount(0);
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، العدد غير متاح',
  );
  expect(writes).toBe(1);
  await page.unroute('**/notifications/*/read');
  await page.getByRole('button', { name: 'قراءة الإشعارات من جديد' }).click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
  await page.getByRole('button', { name: 'اعتبره غير مقروء' }).click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(0);
});
test('NTF-001 stale read revision requires explicit recovery and shows current receipt afterwards', async ({
  page,
}) => {
  const { scope, first, identity } = await seedNotifications(page);
  await createNotifications(database, notificationStates, {
    proposals: proposalModel.collection.name,
    invoices: invoiceModels.Invoice.collection.name,
    payments: paymentModel.collection.name,
  }).setRead(scope, identity.user.id, 'invoice:' + first + ':issued', 0, true);
  await page.getByRole('button', { name: 'علّم كمقروء' }).click();
  await expect(
    page.locator('.notification-inbox').getByRole('alert'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'قراءة الإشعارات من جديد' }).click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ٠ غير مقروء',
  );
});
test('NTF-001 initial and refresh read failures hide stale rows and count with explicit retry', async ({
  page,
}) => {
  await seedNotifications(page);
  let reads = 0;
  await page.route('**/api/v1/notifications?filter=*', async (route) => {
    reads++;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'unavailable' },
      }),
    });
  });
  await page.getByRole('button', { name: 'قراءة الإشعارات من جديد' }).click();
  await expect(
    page.locator('.notification-inbox').getByRole('alert'),
  ).toBeVisible();
  await expect(page.locator('.notification-row')).toHaveCount(0);
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، العدد غير متاح',
  );
  await page.reload();
  await expect(
    page.locator('.notification-inbox').getByRole('alert'),
  ).toBeVisible();
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، العدد غير متاح',
  );
  const stable = reads;
  await page.waitForTimeout(1000);
  expect(reads).toBe(stable);
  await page.unroute('**/api/v1/notifications?filter=*');
  await page.getByRole('button', { name: 'قراءة الإشعارات من جديد' }).click();
  await expect(page.locator('.notification-row')).toHaveCount(1);
});
test('NTF-001 empty states and summary failure are honest and do not prevent inbox recovery', async ({
  page,
}) => {
  await register(page);
  await page.route('**/notifications/summary', (route) => route.abort());
  await page.goto('/dashboard');
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، العدد غير متاح',
  );
  await page.locator('.notification-link').click();
  await page.getByRole('link', { name: 'عرض كل الإشعارات' }).click();
  await expect(
    page.getByRole('heading', { name: 'مفيش إشعارات في الصفحة دي' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'غير المقروء', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'كل الإشعارات مقروءة' }),
  ).toBeVisible();
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ٠ غير مقروء',
  );
});
test('NTF-001 second page keeps full count and read change returns to first page', async ({
  page,
}) => {
  test.setTimeout(60000);
  await seedNotifications(page, 27);
  await page.getByRole('button', { name: 'إشعارات أقدم' }).click();
  await expect(page.locator('.notification-row')).toHaveCount(2);
  await expect(page.locator('.notification-total')).toContainText(
    '٢٧ غير مقروء',
  );
  await page
    .locator('.notification-row')
    .first()
    .getByRole('button', { name: 'علّم كمقروء' })
    .click();
  await expect(page.locator('.notification-row')).toHaveCount(25);
  await expect(page.locator('.notification-total')).toContainText(
    '٢٦ غير مقروء',
  );
});
test('NTF-001 expired access renews once and rapid read clicks save a single receipt', async ({
  page,
}) => {
  await seedNotifications(page);
  now = new Date(now.getTime() + 16 * 60 * 1000);
  let writes = 0,
    refreshes = 0;
  page.on('request', (req) => {
    if (req.url().includes('/notifications/') && req.url().endsWith('/read'))
      writes++;
    if (req.url().endsWith('/auth/refresh')) refreshes++;
  });
  await page.route('**/notifications/*/read', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });
  await page.getByRole('button', { name: 'علّم كمقروء' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
  expect(writes).toBe(2);
  expect(refreshes).toBe(1);
  expect(await notificationStates.countDocuments()).toBe(1);
});
for (const [width, height] of [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1440, 900],
  [640, 450],
] as const) {
  test(
    'responsive audit NTF-001 inbox states ' + width + 'x' + height,
    async ({ page }, info) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await register(page);
      await page.goto('/notifications');
      await expect(
        page.getByRole('heading', { name: 'مفيش إشعارات في الصفحة دي' }),
      ).toBeVisible();
      const observations = [];
      observations.push(
        await inspectResponsiveLayout(page, 'notifications empty', true, width),
      );
      const identity = (await sessions.login.execute(account)).identity,
        scope = identity.workspace.id;
      const client = await clients.create(scope, {
        name: 'عميل الإشعارات',
        email: '',
        phone: '',
        company: '',
        notes: '',
      });
      const service = createInvoices(
        database,
        invoiceModels,
        clientModel,
        projectModel,
        () => shareNow,
      );
      for (let i = 0; i < 27; i++) {
        const draft = await service.create(scope, {
          requestId: randomUUID(),
          clientId: client.id,
          projectId: null,
          title: ('تفاصيل الشغل ' + 'a'.repeat(120)).slice(0, 120),
          summary: '',
          terms: '',
          currency: 'EGP',
          items: [{ title: 'شغل', quantity: 1, unitPrice: '100.00' }],
        });
        await service.issue(scope, draft.id, 1, identity.workspace.name);
      }
      await page
        .getByRole('button', { name: 'قراءة الإشعارات من جديد' })
        .click();
      await expect(page.locator('.notification-row')).toHaveCount(25);
      observations.push(
        await inspectResponsiveLayout(
          page,
          'notifications long titles and unread',
          true,
          width,
        ),
      );
      await page.getByRole('button', { name: 'إشعارات أقدم' }).click();
      await expect(page.locator('.notification-row')).toHaveCount(2);
      observations.push(
        await inspectResponsiveLayout(
          page,
          'notifications older page',
          true,
          width,
        ),
      );
      await page
        .locator('.notification-row')
        .first()
        .getByRole('button', { name: 'علّم كمقروء' })
        .click();
      await expect(page.locator('.notification-row')).toHaveCount(25);
      await page
        .getByRole('button', { name: 'غير المقروء', exact: true })
        .click();
      await expect(page.locator('.notification-row.is-read')).toHaveCount(0);
      observations.push(
        await inspectResponsiveLayout(
          page,
          'notifications filtered',
          true,
          width,
        ),
      );
      await page.route('**/api/v1/notifications?filter=unread', (route) =>
        route.abort(),
      );
      await page
        .getByRole('button', { name: 'قراءة الإشعارات من جديد' })
        .click();
      await expect(
        page.locator('.notification-inbox').getByRole('alert'),
      ).toBeVisible();
      observations.push(
        await inspectResponsiveLayout(
          page,
          'notifications read failure',
          true,
          width,
        ),
      );
      await page.unroute('**/api/v1/notifications?filter=unread');
      await page.getByRole('button', { name: 'الكل', exact: true }).click();
      await expect(page.locator('.notification-row')).toHaveCount(25);
      await page.screenshot({
        path: resolve(
          import.meta.dirname,
          '../../../.cache/ui/notifications/' +
            info.project.name +
            '-' +
            width +
            'x' +
            height +
            '.png',
        ),
        fullPage: true,
        animations: 'disabled',
      });
      await info.attach('notifications layout audit', {
        body: JSON.stringify(observations),
        contentType: 'application/json',
      });
      expect(observations.flatMap((item) => item.issues)).toEqual([]);
      expect(
        await page
          .locator('.notification-row')
          .first()
          .evaluate((node) => getComputedStyle(node).animationName),
      ).toBe('none');
    },
  );
}

test('NTF-001 accepted and rejected proposals have stable single events after decision replay', async ({
  page,
}) => {
  const { scope, clientId, identity } = await seedNotifications(page);
  const decisions = createProposalDecisions(
    database,
    proposalModel,
    projectModel,
    () => shareNow,
  );
  let accepted = '';
  for (const choice of ['accept', 'reject']) {
    const draft = await proposals.create(scope, {
      clientId,
      title: choice === 'accept' ? 'عرض اتقبل' : 'عرض اترفض',
      summary: '',
      terms: '',
      currency: 'EGP',
      items: [{ title: 'شغل', quantity: 1, unitPrice: '10.00' }],
    });
    const shared = await createProposalSharing(
      proposalModel,
      () => shareNow,
    ).issue(scope, identity.workspace.name, draft.id, draft.version, 1);
    const requestId = randomUUID();
    await decisions.execute(shared.token, choice, requestId);
    await decisions.execute(shared.token, choice, requestId);
    if (choice === 'accept') accepted = draft.id;
  }
  await page.getByRole('button', { name: 'قراءة الإشعارات من جديد' }).click();
  await expect(page.locator('.notification-row')).toHaveCount(3);
  const acceptedRow = page
    .locator('.notification-row')
    .filter({ hasText: 'عرض اتقبل' });
  await expect(acceptedRow).toContainText('العميل قبل عرض السعر');
  await expect(
    page.locator('.notification-row').filter({ hasText: 'عرض اترفض' }),
  ).toContainText('العميل رفض عرض السعر');
  await acceptedRow.getByRole('link', { name: 'افتح العرض' }).click();
  await expect(page).toHaveURL('/proposals/' + accepted);
});
test('NTF-001 header badge caps at 99 without truncating the actual accessible count on mobile', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 320, height: 568 });
  await seedNotifications(page, 100, true);
  await expect(page.locator('.notification-badge')).toHaveText('٩٩+');
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ١٠٠ غير مقروء',
  );
  expect(
    (await inspectResponsiveLayout(page, 'large notification badge', true, 320))
      .issues,
  ).toEqual([]);
});
test('NTF-001 finite entrance settles and remains usable with motion enabled', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedNotifications(page, 2);
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === 'running').length === 0,
  );
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/notifications/desktop-viewport.png',
    ),
    animations: 'disabled',
  });
  expect(
    await page
      .locator('.notification-row')
      .first()
      .evaluate((node) => getComputedStyle(node).animationIterationCount),
  ).toBe('1');
  await page
    .locator('.notification-row')
    .first()
    .getByRole('button', { name: 'علّم كمقروء' })
    .click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
});

test('NTF-001 failed authoritative read after a successful save blocks further writes until explicit recovery', async ({
  page,
}) => {
  await seedNotifications(page);
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/read') && request.method() === 'POST')
      writes++;
  });
  await page.route('**/api/v1/notifications?filter=*', (route) =>
    route.abort(),
  );
  await page.getByRole('button', { name: 'علّم كمقروء' }).click();
  await expect(
    page.locator('.notification-inbox').getByRole('alert'),
  ).toContainText('نتيجة تغيير حالة القراءة محتاجة مراجعة');
  await expect(page.locator('.notification-row')).toHaveCount(0);
  expect(await notificationStates.countDocuments({ read: true })).toBe(1);
  expect(writes).toBe(1);
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، العدد غير متاح',
  );
  await page.unroute('**/api/v1/notifications?filter=*');
  await page.getByRole('button', { name: 'قراءة الإشعارات من جديد' }).click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
  expect(writes).toBe(1);
});

async function inspectSidebar(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.locator('#workspace-navigation').evaluate((sidebar) => {
    const element = sidebar as HTMLElement,
      bounds = element.getBoundingClientRect();
    const navigation =
      element.querySelector<HTMLElement>('.sidebar-navigation') ??
      element.querySelector<HTMLElement>('nav')!;
    const footer = element.querySelector<HTMLElement>('.sidebar-user')!;
    const workspace = element.querySelector<HTMLElement>('.workspace-switch')!;
    const workspaceTitle = workspace.querySelector<HTMLElement>('strong')!;
    const links = Array.from(
      element.querySelectorAll<HTMLElement>('.nav-item'),
    );
    const navBounds = navigation.getBoundingClientRect(),
      footerBounds = footer.getBoundingClientRect();
    return {
      outerOverflow: element.scrollHeight - element.clientHeight,
      navigationOverflow: navigation.scrollHeight - navigation.clientHeight,
      footerInside:
        footerBounds.top >= bounds.top &&
        footerBounds.bottom <= bounds.bottom + 1,
      footerOverlapsNavigation: navBounds.bottom > footerBounds.top + 1,
      titleInside:
        workspaceTitle.getBoundingClientRect().top >=
          workspace.getBoundingClientRect().top &&
        workspaceTitle.getBoundingClientRect().bottom <=
          workspace.getBoundingClientRect().bottom + 1,
      smallLinks: links.filter(
        (link) => link.getBoundingClientRect().height < 43,
      ).length,
      viewportOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
      outerScroll: element.scrollTop,
    };
  });
}
for (const variant of [
  'desktop',
  'desktop-boundary',
  'drawer',
  'long-identity',
] as const) {
  test('responsive audit sidebar layout ' + variant, async ({ page }, info) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page);
    if (variant === 'long-identity') {
      await models.User.updateOne(
        { email: account.email },
        { $set: { name: 'عمر محمد ' + 'أ'.repeat(90) } },
      );
      await models.Workspace.updateOne(
        {},
        { $set: { name: 'استوديو أحمد ' + 'a'.repeat(100) } },
      );
      await page.reload();
      await expect(page.locator('.account-panel')).toBeVisible();
    }
    const sizes =
      variant === 'desktop'
        ? [
            [1440, 900],
            [1440, 868],
            [1366, 768],
            [1536, 694],
            [1280, 600],
            [1024, 480],
          ]
        : variant === 'desktop-boundary'
          ? [
              [761, 420],
              [1100, 768],
              [1366, 600],
            ]
          : variant === 'drawer'
            ? [
                [390, 844],
                [390, 568],
                [390, 420],
                [640, 360],
                [320, 256],
              ]
            : [
                [1440, 694],
                [1024, 600],
                [390, 568],
              ];
    const observations = [];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width: width!, height: height! });
      if (
        width! <= 760 &&
        !(await page.getByRole('dialog', { name: 'قائمة مساحة العمل' }).count())
      )
        await page.getByRole('button', { name: 'فتح القائمة' }).click();
      await expect(page.locator('#workspace-navigation')).toBeVisible();
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'sidebar and workspace',
            false,
            width!,
          )
        ).issues,
      ).toEqual([]);
      const metrics = await inspectSidebar(page);
      observations.push({ width, height, ...metrics });
      await expect(
        page
          .getByRole('navigation', { name: 'التنقل الرئيسي' })
          .getByRole('link'),
      ).toHaveCount(6);
      await expect(page.locator('.notification-link')).toHaveCount(1);
      expect(metrics.outerOverflow).toBeLessThanOrEqual(1);
      expect(metrics.footerInside).toBe(true);
      expect(metrics.footerOverlapsNavigation).toBe(false);
      expect(metrics.titleInside).toBe(true);
      expect(metrics.smallLinks).toBe(0);
      expect(metrics.viewportOverflow).toBe(false);
      if (height! >= 568)
        expect(metrics.navigationOverflow).toBeLessThanOrEqual(1);
      await page
        .getByRole('navigation', { name: 'التنقل الرئيسي' })
        .getByRole('link')
        .first()
        .focus();
      await page
        .getByRole('navigation', { name: 'التنقل الرئيسي' })
        .getByRole('link')
        .last()
        .focus();
      await expect(
        page
          .getByRole('navigation', { name: 'التنقل الرئيسي' })
          .getByRole('link')
          .last(),
      ).toBeFocused();
      const last = await page
        .getByRole('navigation', { name: 'التنقل الرئيسي' })
        .getByRole('link')
        .last()
        .boundingBox();
      const footer = await page.locator('.sidebar-user').boundingBox();
      expect(last!.y + last!.height).toBeLessThanOrEqual(footer!.y + 1);
      await page
        .locator('.sidebar-user')
        .getByRole('button', { name: 'تسجيل الخروج' })
        .click({ trial: true });
      expect((await inspectSidebar(page)).outerScroll).toBe(0);
      await page.screenshot({
        path: resolve(
          import.meta.dirname,
          '../../../.cache/ui/sidebar/' +
            info.project.name +
            '-' +
            variant +
            '-' +
            width +
            'x' +
            height +
            '.png',
        ),
        animations: 'disabled',
      });
      if (width! <= 760) {
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'فتح القائمة' }),
        ).toBeFocused();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe(
          '',
        );
      }
    }
    await info.attach('sidebar layout metrics', {
      body: JSON.stringify(observations),
      contentType: 'application/json',
    });
  });
}

test('sidebar uses one header notification entry and keeps drawer focus when notifications have no sidebar item', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 694 });
  await register(page);
  await expect(
    page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('link'),
  ).toHaveCount(6);
  await expect(
    page
      .getByRole('navigation', { name: 'التنقل الرئيسي' })
      .getByRole('link', { name: 'الإشعارات' }),
  ).toHaveCount(0);
  await page.locator('.notification-link').click();
  await page.getByRole('link', { name: 'عرض كل الإشعارات' }).click();
  await expect(page).toHaveURL('/notifications');
  await expect(
    page.getByRole('heading', { level: 1, name: 'الإشعارات' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 568 });
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await expect(
    page.getByRole('dialog', { name: 'قائمة مساحة العمل' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'فتح القائمة' })).toBeFocused();
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await page.setViewportSize({ width: 1024, height: 600 });
  await expect(
    page.getByRole('dialog', { name: 'قائمة مساحة العمل' }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'التنقل الرئيسي' })
      .getByRole('link', { name: 'نظرة عامة', exact: true }),
  ).toBeFocused();
});

async function recoveryLink() {
  await passwordRecovery.service.request(account.email);
  await passwordRecovery.service.deliverNext();
  return '/reset-password#token=' + recoveryMail.at(-1)!.token;
}
const recoveredPassword = 'a different secure recovery passphrase';
async function fillRecoveryPassword(
  page: Page,
  confirmation = recoveredPassword,
) {
  await page
    .getByLabel('كلمة المرور الجديدة', { exact: true })
    .fill(recoveredPassword);
  await page
    .getByLabel('تأكيد كلمة المرور', { exact: true })
    .fill(confirmation);
}
test('password recovery: request from login, mailbox receipt, one-time reset, old-session revocation and new login', async ({
  page,
  context,
}) => {
  await registerAccount.execute(account);
  const old = await sessions.login.execute(account);
  await page.goto('/login');
  await page.getByRole('link', { name: 'نسيت كلمة المرور؟' }).click();
  await expect(page).toHaveURL('/forgot-password');
  await expect(
    page.getByRole('heading', { name: 'نسيت كلمة المرور؟' }),
  ).toBeVisible();
  await page.getByLabel('البريد الإلكتروني').fill('AHMED@Example.COM');
  await expect(page.getByLabel('البريد الإلكتروني')).toHaveValue(
    'AHMED@Example.COM',
  );
  await page.getByRole('button', { name: 'إرسال رابط الاسترجاع' }).click();
  await expect(page.getByRole('heading', { name: 'راجع بريدك' })).toBeVisible();
  expect(recoveryMail).toHaveLength(0);
  await passwordRecovery.service.deliverNext();
  const token = recoveryMail[0]!.token;
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/reset-password#token=' + token);
  await expect(
    page.getByRole('heading', { name: 'كلمة مرور جديدة' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/reset-password');
  await fillRecoveryPassword(page);
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(
    page.getByRole('heading', { name: 'كلمة المرور اتغيّرت' }),
  ).toBeVisible();
  await expect(
    sessions.authenticate.execute(old.accessToken),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  await expect(
    sessions.refresh.execute(old.refreshToken),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(requests.some((url) => url.includes(token))).toBe(false);
  expect(await context.cookies()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'token' })]),
  );
  const persistent = await page.evaluate(() => ({
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
  }));
  expect(JSON.stringify(persistent)).not.toContain(token);
  expect(JSON.stringify(persistent)).not.toContain(recoveredPassword);
  await page.getByRole('link', { name: 'العودة لتسجيل الدخول' }).click();
  await login(page, recoveredPassword);
  await expect(page).toHaveURL('/dashboard');
  await page.goto('/reset-password#token=' + token);
  await fillRecoveryPassword(page);
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(
    page.getByRole('heading', { name: 'الرابط غير متاح' }),
  ).toBeVisible();
});
test('password recovery: missing account receives the same generic confirmation without mail', async ({
  page,
}) => {
  await page.goto('/forgot-password');
  await page.getByLabel('البريد الإلكتروني').fill('missing@example.com');
  await page.getByRole('button', { name: 'إرسال رابط الاسترجاع' }).click();
  await expect(page.getByRole('heading', { name: 'راجع بريدك' })).toBeVisible();
  await passwordRecovery.service.deliverNext();
  expect(recoveryMail).toHaveLength(0);
});
test('password recovery: client validation, confirmation mismatch and password toggle', async ({
  page,
}) => {
  await registerAccount.execute(account);
  await page.goto(await recoveryLink());
  await expect(
    page.getByRole('heading', { name: 'كلمة مرور جديدة' }),
  ).toBeVisible();
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/auth/reset-password')) writes++;
  });
  await fillRecoveryPassword(page, 'wrong confirmation');
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(
    page.getByText('كلمتا المرور لازم يكونوا متطابقين.'),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'إظهار كلمة المرور' }).click();
  await expect(
    page.getByLabel('كلمة المرور الجديدة', { exact: true }),
  ).toHaveAttribute('type', 'text');
  await fillRecoveryPassword(page);
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(
    page.getByRole('heading', { name: 'كلمة المرور اتغيّرت' }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test('password recovery: expired and missing links offer a fresh request', async ({
  page,
}) => {
  await registerAccount.execute(account);
  const link = await recoveryLink();
  now = new Date(now.getTime() + 30 * 60_000);
  await page.goto(link);
  await fillRecoveryPassword(page);
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(
    page.getByRole('heading', { name: 'الرابط غير متاح' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'طلب رابط جديد' }).click();
  await expect(page).toHaveURL('/forgot-password');
  await page.goto('/reset-password?token=do-not-accept-query-tokens');
  await expect(
    page.getByRole('heading', { name: 'الرابط غير متاح' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/reset-password');
});
test('password recovery: reload after removing fragment never persists a reset secret', async ({
  page,
}) => {
  await registerAccount.execute(account);
  await page.goto(await recoveryLink());
  await expect(
    page.getByRole('heading', { name: 'كلمة مرور جديدة' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'الرابط غير متاح' }),
  ).toBeVisible();
});
test('password recovery: lost successful write response blocks repetition and permits confirmed new-password login', async ({
  page,
}) => {
  await registerAccount.execute(account);
  await page.goto(await recoveryLink());
  await fillRecoveryPassword(page);
  let writes = 0;
  await page.route('**/auth/reset-password', async (route) => {
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(
    page.getByRole('heading', { name: 'نتيجة الحفظ غير مؤكدة' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'حفظ كلمة المرور' }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
  await page.getByRole('link', { name: 'العودة لتسجيل الدخول' }).click();
  await login(page, recoveredPassword);
  await expect(page).toHaveURL('/dashboard');
  expect(writes).toBe(1);
});
test('password recovery: double click sends just one reset request', async ({
  page,
}) => {
  await registerAccount.execute(account);
  await page.goto(await recoveryLink());
  await fillRecoveryPassword(page);
  let writes = 0;
  await page.route('**/auth/reset-password', async (route) => {
    writes++;
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).dblclick();
  await expect(
    page.getByRole('heading', { name: 'كلمة المرور اتغيّرت' }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test('password recovery responsive audit: request and reset at mobile, boundary, short and desktop sizes', async ({
  page,
}, testInfo) => {
  await registerAccount.execute(account);
  const link = await recoveryLink();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [320, 256],
    [390, 844],
    [760, 900],
    [761, 900],
    [1280, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    for (const [url, label] of [
      ['/forgot-password', 'request'],
      [link, 'reset'],
    ]) {
      await page.goto(url!);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page.getByLabel(
          label === 'request' ? 'البريد الإلكتروني' : 'كلمة المرور الجديدة',
          { exact: true },
        ),
      ).toBeEnabled();
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'recovery ' + label,
            width! <= 760,
            width!,
          )
        ).issues,
      ).toEqual([]);
      await page.screenshot({
        path: resolve(
          '.cache/ui/recovery',
          testInfo.project.name +
            '-' +
            label +
            '-' +
            width +
            'x' +
            height +
            '.png',
        ),
        fullPage: true,
      });
      if (width! >= 761 && height! >= 720)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollHeight - window.innerHeight,
          ),
        ).toBeLessThanOrEqual(1);
      await page.getByRole('link', { name: 'العودة لتسجيل الدخول' }).click();
      await expect(page).toHaveURL('/login');
    }
  }
});

test('password recovery: a new email fragment in the same tab loads its own token', async ({
  page,
}) => {
  await registerAccount.execute(account);
  await page.goto(await recoveryLink());
  await expect(
    page.getByRole('heading', { name: 'كلمة مرور جديدة' }),
  ).toBeVisible();
  now = new Date(now.getTime() + 60_001);
  const second = await recoveryLink(),
    token = recoveryMail.at(-1)!.token;
  await page.goto(second);
  await expect(page).toHaveURL('/reset-password');
  let submittedToken = '';
  page.on('request', (request) => {
    if (request.url().endsWith('/auth/reset-password')) {
      const data: unknown = request.postDataJSON();
      if (
        typeof data === 'object' &&
        data !== null &&
        'token' in data &&
        typeof data.token === 'string'
      )
        submittedToken = data.token;
    }
  });
  await fillRecoveryPassword(page);
  await page.getByRole('button', { name: 'حفظ كلمة المرور' }).click();
  await expect(
    page.getByRole('heading', { name: 'كلمة المرور اتغيّرت' }),
  ).toBeVisible();
  expect(submittedToken).toBe(token);
});

async function releaseAccessibility(page: Page, screen: string) {
  await finishEntrance(page);
  await page.evaluate(() => document.fonts.ready);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await test.info().attach('accessibility-' + screen, {
    body: JSON.stringify(
      { url: page.url().split('#')[0], violations: audit.violations },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  if (audit.violations.length)
    releaseAuditFailures.push({
      screen,
      violations: audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          failure: n.failureSummary,
        })),
      })),
    });
}

test('REL-001 accessibility on public authentication and recovery states', async ({
  page,
}) => {
  for (const route of [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await releaseAccessibility(page, route.slice(1));
  }
  await page.goto('/login');
  await page.getByRole('button', { name: 'دخول لمساحتك' }).click();
  await expect(page.getByLabel('البريد الإلكتروني')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await releaseAccessibility(page, 'login-validation');
});

test('REL-001 complete real journey and accessibility from account to paid invoice and client portal', async ({
  page,
  browser,
  context,
  browserName,
}) => {
  test.setTimeout(180_000);
  await register(page);
  await releaseAccessibility(page, 'dashboard-empty');
  await openClients(page);
  await newClient(page);
  await releaseAccessibility(page, 'client-dialog');
  await page.getByRole('button', { name: 'إضافة العميل', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const client = await clientModel.findOne().orFail();
  await releaseAccessibility(page, 'client-list');
  await page.goto('/proposals/new');
  await fillDraft(page);
  await releaseAccessibility(page, 'proposal-form');
  const proposalId = await saveDraft(page);
  await releaseAccessibility(page, 'proposal-review');
  const proposalLink = await createSharingLink(page);
  const anonymous = await browser.newContext({
    ignoreHTTPSErrors: process.env.E2E_SECURE_COOKIES === 'true',
  });
  try {
    const viewer = await anonymous.newPage();
    await viewer.goto(proposalLink);
    await expect(
      viewer.getByRole('button', { name: 'قبول العرض', exact: true }),
    ).toBeVisible();
    await releaseAccessibility(viewer, 'public-proposal');
    await viewer
      .getByRole('button', { name: 'قبول العرض', exact: true })
      .click();
    await releaseAccessibility(viewer, 'acceptance-confirmation');
    await viewer
      .getByRole('button', { name: 'تأكيد قبول العرض', exact: true })
      .click();
    await expect(
      viewer.getByRole('heading', { name: 'تم قبول العرض', exact: true }),
    ).toBeVisible();
    const project = await projectModel.findOne().orFail();
    expect((await proposalModel.findById(proposalId).orFail()).status).toBe(
      'accepted',
    );
    await page.goto('/projects/' + project.id);
    await expect(
      page.getByRole('button', { name: 'مهمة جديدة', exact: true }),
    ).toBeVisible();
    const taskId = await addTaskInBrowser(page, 'تصميم الشعار النهائي');
    await moveTaskInBrowser(page, taskId, 'done');
    await setTaskVisibilityInBrowser(page, taskId, true);
    await releaseAccessibility(page, 'project-tasks');
    await page.goto('/invoices/new');
    await page
      .getByLabel('عنوان الفاتورة', { exact: true })
      .fill('فاتورة هوية مطعم ورقة');
    await page.getByRole('button', { name: /سارة علي/ }).click();
    await selectOption(
      page.getByRole('combobox', { name: 'المشروع', ...{ exact: false } }),
      project.id,
    );
    await page.getByLabel('وصف البند 1', { exact: true }).fill('تنفيذ الهوية');
    await page.getByLabel('سعر الوحدة 1', { exact: true }).fill('1500.50');
    await releaseAccessibility(page, 'invoice-form');
    await page
      .getByRole('button', { name: 'حفظ المسودة', exact: true })
      .click();
    await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}$/u);
    const invoiceId = page.url().split('/').at(-1)!;
    await issueInvoiceInBrowser(page);
    const invoiceLink = await shareInvoiceInBrowser(page);
    await openPayment(page, '500.25');
    await releaseAccessibility(page, 'payment-dialog');
    await confirmPayment(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.payment-balance')).toHaveAttribute(
      'data-payment-status',
      'partially_paid',
    );
    await recordPayment(page, '1000.25');
    await expect(page.locator('.payment-balance')).toHaveAttribute(
      'data-payment-status',
      'paid',
    );
    await releaseAccessibility(page, 'paid-invoice');
    await viewer.goto(invoiceLink);
    await expect(viewer.getByRole('table')).toBeVisible();
    await releaseAccessibility(viewer, 'public-invoice');
    const ledger = await paymentModel.findOne({ invoice: invoiceId }).orFail();
    expect(
      ledger.entries.reduce((total, entry) => total + entry.amountMinor, 0),
    ).toBe(150050);
    expect(
      (await invoiceModels.Invoice.findById(invoiceId).orFail()).totalMinor,
    ).toBe(150050);
    await page.goto('/clients/' + client.id + '/portal');
    await expect(page.locator('.portal-preview')).toBeVisible();
    await releaseAccessibility(page, 'portal-preview');
    const portalLink = await issuePortal(page);
    await viewer.goto(portalLink);
    await expect(viewer.locator('.portal-project')).toHaveCount(1);
    await expect(viewer.locator('.portal-invoice')).toHaveCount(1);
    await expect(
      viewer.getByText('تصميم الشعار النهائي', { exact: true }),
    ).toBeVisible();
    await releaseAccessibility(viewer, 'public-portal');
    await page.goto('/notifications');
    await expect(page.locator('.notification-row')).toHaveCount(4);
    await releaseAccessibility(page, 'notifications');
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      account.name,
    );
    await releaseAccessibility(page, 'dashboard-populated');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      account.name,
    );
    if (process.env.E2E_SECURE_COOKIES === 'true') {
      const cookies = await context.cookies();
      const cookie = cookies.find(
        (cookie) => cookie.name === '__Host-lancelio_refresh',
      );
      expect(cookie).toMatchObject({
        secure: true,
        httpOnly: true,
        path: '/',
      });
      // Native WebKit on Windows reports SameSite=None even for explicit
      // attributes (also accounted for by Playwright's upstream cookie tests).
      // Verify the actual wire attribute on every engine below; keep the
      // cookie-store assertion on platforms that expose it accurately.
      if (!(browserName === 'webkit' && process.platform === 'win32'))
        expect(cookie?.sameSite).toBe('Strict');
      const health = await page.request.get('/api/v1/health/ready');
      expect(health.status()).toBe(200);
      expect(health.headers()['cache-control']).toBe('no-store');
      const denied = await page.request.post('/api/v1/auth/refresh', {
        headers: { Origin: 'https://untrusted.example' },
      });
      expect(denied.status()).toBe(403);
      const first = cookies.find(
        (cookie) => cookie.name === '__Host-lancelio_refresh',
      )!.value;
      const refresh = await page.request.post('/api/v1/auth/refresh', {
        headers: { Origin: testOrigin },
      });
      expect(refresh.status()).toBe(200);
      const setCookie = refresh.headers()['set-cookie']!;
      expect(setCookie).toMatch(/^__Host-lancelio_refresh=/u);
      expect(setCookie).toMatch(/; SameSite=Strict(?:;|$)/u);
      expect(setCookie).toMatch(/; Secure(?:;|$)/u);
      expect(setCookie).toMatch(/; HttpOnly(?:;|$)/u);
      expect(setCookie).not.toMatch(/; Domain=/iu);
      expect(
        (await context.cookies()).find(
          (cookie) => cookie.name === '__Host-lancelio_refresh',
        )!.value,
      ).not.toBe(first);
    }
    await page
      .getByRole('button', { name: 'تسجيل الخروج', exact: true })
      .click();
    await expect(page).toHaveURL('/login');
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
    expect(await sessionModel.countDocuments({ revokedAt: null })).toBe(0);
  } finally {
    await anonymous.close();
  }
});

async function openProfile(page: Page) {
  await page.goto('/settings');
  await expect(page.getByLabel('الاسم الشخصي', { exact: true })).toHaveValue(
    account.name,
  );
}

async function openWorkspaceSettings(page: Page) {
  await page.goto('/settings/workspace');
  await expect(page.getByLabel('اسم مساحة العمل', { exact: true })).toHaveValue(
    account.workspaceName,
  );
}

async function openSecuritySettings(page: Page) {
  await page.goto('/settings/security');
  await expect(
    page.getByLabel('كلمة المرور الحالية', { exact: true }),
  ).toBeVisible();
}

test('workspace search reads all collections beyond the first list page and isolates authenticated workspaces', async ({
  page,
}) => {
  test.setTimeout(90000);
  const { scope, clientId } = await seedOverview(page);
  await seedOverviewTasks(scope, clientId);
  const loginResult = await sessions.login.execute(account);
  const token = loginResult.accessToken;
  const url = 'http://localhost:5100/api/v1/search';
  const headers = { Authorization: 'Bearer ' + token };
  expect((await page.request.get(url + '?q=عميل')).status()).toBe(401);
  for (const query of [
    'q=a',
    'q=' + 'x'.repeat(101),
    'q=عميل&workspace=' + scope,
    'q=a&q=b',
  ]) {
    expect(
      (await page.request.get(url + '?' + query, { headers })).status(),
    ).toBe(422);
  }
  const other = await registerAccount.execute({
    ...account,
    email: 'search-other@example.com',
  });
  const foreign = new Types.ObjectId(other.workspace.id);
  for (const collection of [
    clientModel.collection.name,
    projectModel.collection.name,
    proposalModel.collection.name,
    invoiceModels.Invoice.collection.name,
  ]) {
    await database.collection(collection).insertOne({
      workspace: foreign,
      name: 'عميل دفتر المتابعة OTHER PRIVATE',
      title: 'OTHER PRIVATE',
      client: { name: 'عميل دفتر المتابعة OTHER PRIVATE' },
      notes: 'DO NOT RETURN',
      share: { digest: 'SECRET' },
    });
  }
  const response = await page.request.get(url, {
    headers,
    params: { q: 'عميل دفتر المتابعة' },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json();
  expect(body.data.groups).toHaveLength(4);
  for (const group of body.data.groups) {
    expect(group.items.length).toBeGreaterThan(0);
    for (const item of group.items)
      expect(Object.keys(item).sort()).toEqual([
        'archived',
        'id',
        'subtitle',
        'title',
      ]);
  }
  expect(JSON.stringify(body)).not.toContain('OTHER PRIVATE');
  expect(JSON.stringify(body)).not.toContain('SECRET');
  const old = await clients.create(scope, {
    name: 'عميل قديم بعيد [A+B].*',
    email: '',
    company: '',
    phone: '',
    notes: 'PRIVATE NOTE',
  });
  for (let index = 0; index < 30; index++)
    await clients.create(scope, {
      name: 'عميل أحدث ' + index,
      email: '',
      company: '',
      phone: '',
      notes: '',
    });
  const found = await (
    await page.request.get(url, { headers, params: { q: '[A+B].*' } })
  ).json();
  expect(
    found.data.groups[0].items.map((item: { id: string }) => item.id),
  ).toEqual([old.id]);
  const limited = await (
    await page.request.get(url, { headers, params: { q: 'عميل' } })
  ).json();
  expect(limited.data.groups[0].items).toHaveLength(5);
  expect(limited.data.groups[0].hasMore).toBe(true);
  const invoice = await invoiceModels.Invoice.findOne({
    workspace: scope,
  }).orFail();
  const arabicNumber = invoice.number.replace(/\d/gu, (digit) =>
    String.fromCharCode(0x660 + Number(digit)),
  );
  const byNumber = await (
    await page.request.get(url, { headers, params: { q: arabicNumber } })
  ).json();
  expect(
    byNumber.data.groups.find(
      (group: { kind: string }) => group.kind === 'invoices',
    ).items[0].id,
  ).toBe(String(invoice._id));
});

test('workspace search keyboard opens records and quick creation works from every page', async ({
  page,
}) => {
  test.setTimeout(90000);
  await seedOverview(page);
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', {
    name: 'البحث في مساحة العمل',
    exact: true,
  });
  const input = search.getByRole('searchbox');
  await expect(input).toBeFocused();
  await input.fill('عميل دفتر المتابعة');
  await expect(search.locator('.workspace-search-group')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await expect(search.locator('.workspace-command-link').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('اسم العميل', { exact: true })).toHaveValue(
    'عميل دفتر المتابعة',
  );
  await expect(page).toHaveURL(/\/clients\?client=[a-f\d]{24}$/);
  await page.keyboard.press('Control+k');
  await expect(search).toHaveCount(0);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'إغلاق النافذة', exact: true })
    .click();
  await expect(page).toHaveURL('/clients');
  const add = page.getByRole('button', { name: 'إضافة جديد', exact: true });
  await add.click();
  const menu = page.getByRole('dialog', { name: 'إضافة جديد', exact: true });
  await expect(menu.getByRole('link')).toHaveCount(4);
  await menu.getByRole('link', { name: 'عميل جديد', exact: false }).click();
  await expect(page.getByLabel('اسم العميل', { exact: true })).toHaveValue('');
  await page
    .getByLabel('اسم العميل', { exact: true })
    .fill('عميل من الإضافة السريعة');
  await page.getByRole('button', { name: 'إضافة العميل', exact: true }).click();
  await expect(page).toHaveURL('/clients');
  expect(
    await clientModel.countDocuments({ name: 'عميل من الإضافة السريعة' }),
  ).toBe(1);
  for (const [label, pathname] of [
    ['عرض سعر جديد', '/proposals/new'],
    ['مشروع جديد', '/projects/new'],
    ['فاتورة جديدة', '/invoices/new'],
  ] as const) {
    await add.click();
    await menu.getByRole('link', { name: label, exact: false }).click();
    await expect(page).toHaveURL(pathname);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page
    .getByRole('button', { name: 'البحث في مساحة العمل', exact: true })
    .click();
  await expect(search).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'البحث في مساحة العمل', exact: true }),
  ).toBeFocused();
});

test('workspace client entries retry failed reads and keep archived search results read-only', async ({
  page,
}) => {
  const { scope, clientId } = await seedOverview(page);
  const pattern = '**/api/v1/clients/' + clientId;
  await page.route(pattern, (route) => route.abort());
  await page.goto('/clients?client=' + clientId);
  await expect(page.getByRole('alert').filter({ hasText: /.+/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unroute(pattern);
  await page.getByRole('button', { name: 'إعادة فتح العميل' }).click();
  await expect(page.getByLabel('اسم العميل', { exact: true })).toHaveValue(
    'عميل دفتر المتابعة',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'إغلاق النافذة', exact: true })
    .click();
  await expect(page).toHaveURL('/clients');
  const client = await clients.read(scope, clientId);
  await clients.archive(scope, clientId, client.version);
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', {
    name: 'البحث في مساحة العمل',
    exact: true,
  });
  await search.getByRole('searchbox').fill('عميل دفتر المتابعة');
  const clientsGroup = search.getByRole('region', {
    name: 'العملاء',
    exact: true,
  });
  await expect(clientsGroup).toContainText('عميل مؤرشف');
  await clientsGroup.getByRole('link').click();
  await expect(page.getByLabel('اسم العميل', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  );
  await expect(
    page.getByRole('button', { name: 'حفظ التعديلات', exact: true }),
  ).toHaveCount(0);
});

test('workspace actions protect dirty drafts before following global creation links', async ({
  page,
}) => {
  await register(page);
  await page.goto('/proposals/new');
  await page
    .getByLabel('عنوان العرض', { exact: true })
    .fill('تعديل لسه ما اتحفظش');
  await page.getByRole('button', { name: 'إضافة جديد', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'إضافة جديد', exact: true });
  const project = menu.getByRole('link', { name: 'مشروع جديد', exact: false });
  await project.click();
  const confirmation = page.getByRole('dialog', {
    name: 'نكمّل الخطوة دي؟',
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'رجوع', exact: true }).click();
  await expect(menu).toBeVisible();
  await expect(page).toHaveURL('/proposals/new');
  await project.click();
  await confirmation
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page).toHaveURL('/projects/new');
  expect(await proposalModel.countDocuments()).toBe(0);
});

test('workspace search ignores delayed old queries and recovers failed reads without stale results', async ({
  page,
}) => {
  await seedOverview(page);
  await page
    .getByRole('button', { name: 'البحث في مساحة العمل', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'البحث في مساحة العمل',
    exact: true,
  });
  const input = dialog.getByRole('searchbox');
  let release = () => {};
  const held = new Promise<void>((resolveRead) => {
    release = resolveRead;
  });
  await page.route('**/api/v1/search?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === 'عميل') {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await input.fill('عميل');
    await page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/v1/search',
    );
    await input.fill('اسم مش موجود خالص');
    await expect(
      dialog.getByRole('heading', { name: 'مفيش نتائج مطابقة' }),
    ).toBeVisible();
    release();
    await expect(dialog.locator('.workspace-command-link')).toHaveCount(0);
    await page.unrouteAll({ behavior: 'wait' });
    await page.route('**/api/v1/search?*', (route) => route.abort());
    await input.fill('عميل');
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.locator('.workspace-command-link')).toHaveCount(0);
    await page.unrouteAll({ behavior: 'wait' });
    await dialog.getByRole('button', { name: 'إعادة البحث' }).click();
    await expect(dialog.locator('.workspace-search-group')).toHaveCount(3);
  } finally {
    release();
  }
});

test('workspace commands responsive audit fits search and creation at desktop, tablet and short mobile sizes', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedOverview(page);
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
    [320, 568],
    [320, 256],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      (
        await inspectResponsiveLayout(
          page,
          'workspace-header',
          width <= 960,
          width,
        )
      ).issues,
    ).toEqual([]);
    for (const mode of ['search', 'create'] as const) {
      await page
        .getByRole('button', {
          name: mode === 'search' ? 'البحث في مساحة العمل' : 'إضافة جديد',
          exact: true,
        })
        .click();
      const dialog = page.getByRole('dialog', {
        name: mode === 'search' ? 'البحث في مساحة العمل' : 'إضافة جديد',
        exact: true,
      });
      if (mode === 'search') {
        await dialog.getByRole('searchbox').fill('عميل دفتر');
        await expect(dialog.locator('.workspace-search-group')).toHaveCount(3);
      }
      await expect(dialog).toHaveCSS('animation-name', 'none');
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'workspace-' + mode,
            width <= 960,
            width,
          )
        ).issues,
      ).toEqual([]);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: resolve(
          import.meta.dirname,
          `../../../.cache/ui/workspace-actions/${mode}-${width}-${height}.png`,
        ),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  }
});

test('shared feedback responsive audit keeps confirmation safe, restores focus and reports only saved changes', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await register(page);
  await openProfile(page);
  const name = page.getByLabel('الاسم الشخصي', { exact: true });
  await name.fill('اسم محفوظ جديد');
  const security = page
    .getByRole('navigation', { name: 'أقسام الإعدادات' })
    .getByRole('link', { name: 'أمان الحساب', exact: true });
  const confirm = page.getByRole('dialog', {
    name: 'نكمّل الخطوة دي؟',
    exact: true,
  });
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 568],
    [320, 256],
  ] as const) {
    await page.setViewportSize({ width, height });
    await security.click();
    await expect(confirm).toBeVisible();
    await expect(
      confirm.getByRole('button', { name: 'رجوع', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      confirm.getByRole('button', { name: 'تأكيد', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      confirm.getByRole('button', { name: 'رجوع', exact: true }),
    ).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      (
        await inspectResponsiveLayout(
          page,
          'shared-confirmation',
          width <= 960,
          width,
        )
      ).issues,
    ).toEqual([]);
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/feedback/confirmation-${width}-${height}.png`,
      ),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(security).toBeFocused();
    await expect(name).toHaveValue('اسم محفوظ جديد');
    expect((await models.User.findOne().orFail()).name).toBe(account.name);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  const toast = page.getByRole('region', { name: 'آخر عملية ناجحة' });
  await expect(toast).toContainText('اسمك اتحدّث');
  expect((await models.User.findOne().orFail()).name).toBe('اسم محفوظ جديد');
  expect(
    (await inspectResponsiveLayout(page, 'success-toast', true, 390)).issues,
  ).toEqual([]);
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/feedback/success-mobile.png',
    ),
    animations: 'disabled',
  });
  await toast.getByRole('button', { name: 'إغلاق رسالة النجاح' }).click();
  await expect(toast).toHaveCount(0);
  await page.route('**/api/v1/settings/profile', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({
        status: 503,
        json: {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Unavailable' },
        },
      });
    else await route.continue();
  });
  await name.fill('اسم لم يتحفظ');
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(
    page.locator('.profile-settings').getByRole('alert'),
  ).toBeVisible();
  await expect(toast).toHaveCount(0);
  expect((await models.User.findOne().orFail()).name).toBe('اسم محفوظ جديد');
});

test('shared confirmation protects same-document back navigation until the draft is discarded', async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole('navigation', { name: 'التنقل الرئيسي' })
    .getByRole('link', { name: 'الإعدادات', exact: true })
    .click();
  const name = page.getByLabel('الاسم الشخصي', { exact: true });
  await expect(name).toHaveValue(account.name);
  await name.fill('تعديل قبل الرجوع');
  const confirmation = page.getByRole('dialog', {
    name: 'نكمّل الخطوة دي؟',
    exact: true,
  });
  await page.evaluate(() => window.history.back());
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'رجوع', exact: true }).click();
  await expect(page).toHaveURL('/settings');
  await expect(name).toHaveValue('تعديل قبل الرجوع');
  await page.evaluate(() => window.history.back());
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page).toHaveURL('/dashboard');
  expect((await models.User.findOne().orFail()).name).toBe(account.name);
});

test('shared loading placeholders cover delayed reads, recover errors and use the correct brand contrast', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await expect(page.locator('.brand-light img')).toBeVisible();
  await expect(page.locator('.brand:not(.brand-light) img')).toBeAttached();
  const light = await page.locator('.brand-light img').getAttribute('src');
  const green = await page
    .locator('.brand:not(.brand-light) img')
    .getAttribute('src');
  expect(light).not.toBe(green);
  expect(green).toContain('logo-green');
  await register(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pages = [
    ['/dashboard', '/dashboard'],
    ['/clients', '/clients'],
    ['/proposals', '/proposals'],
    ['/projects', '/projects'],
    ['/invoices', '/invoices'],
    ['/settings', '/settings/profile'],
    ['/settings/workspace', '/settings/workspace'],
    ['/notifications', '/notifications'],
  ] as const;
  for (const [pathname, endpoint] of pages) {
    let release = () => {};
    const held = new Promise<void>((resolveRead) => {
      release = resolveRead;
    });
    const pattern = (url: URL) => url.pathname === '/api/v1' + endpoint;
    await page.route(pattern, async (route) => {
      await held;
      await route.continue();
    });
    try {
      await page.goto(pathname);
      const loading = page.locator('.loading-placeholder');
      await expect(loading).toBeVisible();
      await expect(loading).toHaveAttribute('role', 'status');
      await expect(loading.locator('.skeleton-block').first()).toHaveCSS(
        'animation-name',
        'none',
      );
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'loading-' + pathname,
            false,
            1440,
          )
        ).issues,
      ).toEqual([]);
      if (pathname === '/dashboard')
        await page.screenshot({
          path: resolve(
            import.meta.dirname,
            '../../../.cache/ui/feedback/loading-desktop.png',
          ),
          animations: 'disabled',
        });
      release();
      await expect(loading).toHaveCount(0);
    } finally {
      release();
      await page.unroute(pattern);
    }
  }
  await page.route('**/api/v1/dashboard', (route) =>
    route.fulfill({
      status: 503,
      json: {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Unavailable' },
      },
    }),
  );
  await page.goto('/dashboard');
  await expect(page.locator('.work-overview').getByRole('alert')).toBeVisible();
  await expect(
    page.locator('.loading-placeholder, .overview-counts'),
  ).toHaveCount(0);
  await page.unroute('**/api/v1/dashboard');
  await page
    .getByRole('button', { name: 'تحديث الأرقام', exact: true })
    .click();
  await expect(page.locator('.overview-counts article')).toHaveCount(4);
});

test('settings sections have independent routes and protect unsaved profile and password fields', async ({
  page,
}) => {
  await register(page);
  await openProfile(page);
  const navigation = page.getByRole('navigation', { name: 'أقسام الإعدادات' });
  const profileLink = navigation.getByRole('link', {
    name: 'الملف الشخصي',
    exact: true,
  });
  const securityLink = navigation.getByRole('link', {
    name: 'أمان الحساب',
    exact: true,
  });
  const workspaceLink = navigation.getByRole('link', {
    name: 'مساحة العمل',
    exact: true,
  });
  await expect(profileLink).toHaveAttribute('aria-current', 'page');
  await expect(
    page.locator('.workspace-settings, .security-settings'),
  ).toHaveCount(0);
  await page
    .getByLabel('الاسم الشخصي', { exact: true })
    .fill('تعديل شخصي لم يتحفظ');
  const confirmation32 = respondToAppConfirmation(page, (dialog) =>
    dialog.dismiss(),
  );
  await securityLink.click();
  await confirmation32;
  await expect(page).toHaveURL('/settings');
  await expect(page.getByLabel('الاسم الشخصي', { exact: true })).toHaveValue(
    'تعديل شخصي لم يتحفظ',
  );
  const confirmation33 = respondToAppConfirmation(page, (dialog) =>
    dialog.accept(),
  );
  await securityLink.focus();
  await securityLink.press('Enter');
  await confirmation33;
  await expect(page).toHaveURL('/settings/security');
  await expect(securityLink).toHaveAttribute('aria-current', 'page');
  await expect(
    page.locator('.workspace-settings, .profile-settings'),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'التنقل الرئيسي' })
      .getByRole('link', { name: 'الإعدادات', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page
    .getByLabel('كلمة المرور الجديدة', { exact: true })
    .fill('a private unsaved password');
  const confirmation34 = respondToAppConfirmation(page, (dialog) =>
    dialog.dismiss(),
  );
  await workspaceLink.click();
  await confirmation34;
  await expect(page).toHaveURL('/settings/security');
  await expect(
    page.getByLabel('كلمة المرور الجديدة', { exact: true }),
  ).toHaveValue('a private unsaved password');
  await page.getByRole('button', { name: 'مسح الحقول', exact: true }).click();
  await workspaceLink.click();
  await expect(page).toHaveURL('/settings/workspace');
  await expect(workspaceLink).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('اسم مساحة العمل', { exact: true })).toHaveValue(
    account.workspaceName,
  );
  await expect(
    page.locator('.profile-settings, .security-settings'),
  ).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL('/settings/security');
  await expect(
    page.getByLabel('كلمة المرور الجديدة', { exact: true }),
  ).toHaveValue('');
  await page.reload();
  await expect(securityLink).toHaveAttribute('aria-current', 'page');
  await profileLink.click();
  await expect(page.getByLabel('الاسم الشخصي', { exact: true })).toHaveValue(
    account.name,
  );
});

test('settings sections responsive audit uses one readable panel and labelled navigation', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await register(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 568],
    [320, 256],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [section, href] of [
      ['profile', '/settings'],
      ['security', '/settings/security'],
      ['workspace', '/settings/workspace'],
    ] as const) {
      await page.goto(href);
      await expect(
        page.getByRole('heading', { level: 1, name: 'الإعدادات', exact: true }),
      ).toBeVisible();
      if (section === 'profile')
        await expect(
          page.getByLabel('الاسم الشخصي', { exact: true }),
        ).toHaveValue(account.name);
      if (section === 'workspace')
        await expect(
          page.getByLabel('اسم مساحة العمل', { exact: true }),
        ).toHaveValue(account.workspaceName);
      expect(
        (
          await inspectResponsiveLayout(
            page,
            `settings ${section}`,
            width <= 390,
            width,
          )
        ).issues,
      ).toEqual([]);
      await expect(
        page.locator(
          '.profile-settings, .security-settings, .workspace-settings',
        ),
      ).toHaveCount(1);
      if (height > 256) {
        await releaseAccessibility(page, `settings-${section}-${width}`);
        await page.screenshot({
          path: resolve(
            import.meta.dirname,
            `../../../.cache/ui/settings-sections/${section}-${width}.png`,
          ),
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
  }
});

const securityPassword = 'new long secure browser passphrase';
async function fillPasswordChange(
  page: Page,
  currentPassword = account.password,
  next = securityPassword,
) {
  await page
    .getByLabel('كلمة المرور الحالية', { exact: true })
    .fill(currentPassword);
  await page.getByLabel('كلمة المرور الجديدة', { exact: true }).fill(next);
  await page
    .getByLabel('تأكيد كلمة المرور الجديدة', { exact: true })
    .fill(next);
  await page
    .getByRole('button', { name: 'مراجعة تغيير كلمة المرور', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'رجوع للمراجعة', exact: true }),
  ).toBeFocused();
}
async function confirmPasswordChange(page: Page) {
  await page
    .getByRole('button', { name: 'تأكيد التغيير والخروج', exact: true })
    .click();
}

test('SET-002 confirmed real change signs out same-browser tabs and another device, then accepts only the new password', async ({
  page,
  context,
  browser,
}) => {
  await register(page);
  const sibling = await context.newPage();
  await sibling.goto('/dashboard');
  await expect(sibling.getByRole('heading', { level: 1 })).toContainText(
    account.name,
  );
  const device = await browser.newContext();
  try {
    const other = await device.newPage();
    await other.goto(testOrigin + '/login');
    await login(other);
    await expect(other).toHaveURL(testOrigin + '/dashboard');
    await openSecuritySettings(page);
    await fillPasswordChange(page);
    await releaseAccessibility(page, 'security-confirmation');
    await confirmPasswordChange(page);
    await expect(page).toHaveURL('/login');
    await expect(sibling).toHaveURL('/login');
    await expect(page.getByRole('status')).toContainText('كل الأجهزة');
    expect(await sessionModel.countDocuments({ revokedAt: null })).toBe(0);
    expect(
      (await context.cookies()).find(
        (item) => item.name === 'lancelio_refresh',
      ),
    ).toBeUndefined();
    await other.reload();
    await expect(other).toHaveURL(testOrigin + '/login');
    await login(page);
    await expect(page.locator('.auth-main').getByRole('alert')).toContainText(
      'غير صحيحة',
    );
    await login(page, securityPassword);
    await expect(page).toHaveURL('/dashboard');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      account.name,
    );
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
      })),
    ).toEqual({ local: 0, session: 0 });
  } finally {
    await device.close();
  }
});

test('SET-002 validation, current-password errors and cancel keep keyboard focus and never write before confirmation', async ({
  page,
}) => {
  await register(page);
  await openSecuritySettings(page);
  let writes = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/settings/password')) writes++;
  });
  await page.getByRole('button', { name: 'مراجعة تغيير كلمة المرور' }).click();
  await expect(
    page.getByLabel('كلمة المرور الحالية', { exact: true }),
  ).toBeFocused();
  await fillPasswordChange(page);
  await page.getByRole('button', { name: 'رجوع للمراجعة' }).press('Enter');
  await expect(
    page.getByRole('button', { name: 'مراجعة تغيير كلمة المرور' }),
  ).toBeFocused();
  expect(writes).toBe(0);
  await page
    .getByLabel('تأكيد كلمة المرور الجديدة', { exact: true })
    .fill('different');
  await page.getByRole('button', { name: 'مراجعة تغيير كلمة المرور' }).click();
  await expect(
    page.getByLabel('تأكيد كلمة المرور الجديدة', { exact: true }),
  ).toBeFocused();
  await expect(
    page.locator('.security-settings').getByRole('alert'),
  ).toContainText('متطابقين');
  await releaseAccessibility(page, 'security-invalid-confirmation');
  await fillPasswordChange(page, 'incorrect');
  await confirmPasswordChange(page);
  await expect(
    page.locator('.security-settings').getByRole('alert'),
  ).toContainText('الحالية غير صحيحة');
  await expect(
    page.getByLabel('كلمة المرور الحالية', { exact: true }),
  ).toHaveValue('');
  await expect(
    page.getByLabel('كلمة المرور الحالية', { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel('كلمة المرور الجديدة', { exact: true }),
  ).toHaveValue(securityPassword);
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'مسح الحقول' }).click();
  for (const label of [
    'كلمة المرور الحالية',
    'كلمة المرور الجديدة',
    'تأكيد كلمة المرور الجديدة',
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
});

test('SET-002 account rate limit keeps the session and draft without a retry', async ({
  page,
}) => {
  await register(page);
  await openSecuritySettings(page);
  const id = (await models.User.findOne({
    email: account.email,
  }).lean())!._id.toHexString();
  for (let i = 0; i < 5; i++)
    await passwordChange.store.reserveAttempt(id, now);
  let writes = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/settings/password')) writes++;
  });
  await fillPasswordChange(page);
  await confirmPasswordChange(page);
  await expect(
    page.locator('.security-settings').getByRole('alert'),
  ).toContainText('محاولات كتير');
  await expect(page).toHaveURL('/settings/security');
  await expect(
    page.getByLabel('كلمة المرور الجديدة', { exact: true }),
  ).toHaveValue(securityPassword);
  await expect(
    page.getByRole('button', { name: 'مراجعة تغيير كلمة المرور', exact: true }),
  ).toBeFocused();
  expect(writes).toBe(1);
});

for (const committed of [true, false]) {
  test(`SET-002 ${committed ? 'committed' : 'uncommitted'} lost response ends local access without replay and allows explicit login verification`, async ({
    page,
    context,
  }) => {
    await register(page);
    await openSecuritySettings(page);
    const sibling = await context.newPage();
    await sibling.goto('/dashboard');
    await expect(sibling.getByRole('heading', { level: 1 })).toContainText(
      account.name,
    );
    let writes = 0;
    await page.route('**/api/v1/settings/password', async (route) => {
      writes++;
      if (committed) expect((await route.fetch()).status()).toBe(204);
      await route.abort('failed');
    });
    await fillPasswordChange(page);
    await confirmPasswordChange(page);
    await expect(page).toHaveURL('/login');
    await expect(sibling).toHaveURL('/login');
    await expect(page.getByRole('status')).toContainText('غير مؤكدة');
    await expect(page.locator('.security-settings')).toHaveCount(0);
    expect(writes).toBe(1);
    if (!committed) {
      await login(page, securityPassword);
      await expect(page.locator('.auth-main').getByRole('alert')).toContainText(
        'غير صحيحة',
      );
    }
    await login(page, committed ? securityPassword : account.password);
    await expect(page).toHaveURL('/dashboard');
    expect(writes).toBe(1);
  });
}

test('SET-002 double confirmation emits one pending write and delayed old identity cannot restore a signed-out account', async ({
  page,
}) => {
  await register(page);
  await openSecuritySettings(page);
  let releaseRead!: () => void, readStarted!: () => void;
  const readGate = new Promise<void>((resolveGate) => {
    releaseRead = resolveGate;
  });
  const readReached = new Promise<void>((resolveReached) => {
    readStarted = resolveReached;
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    const response = await route.fetch();
    readStarted();
    await readGate;
    await route.fulfill({ response });
  });
  await page
    .getByRole('button', { name: 'تحديث بيانات المساحة', exact: true })
    .click();
  await readReached;
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  let started!: () => void;
  const reached = new Promise<void>((resolveReached) => {
    started = resolveReached;
  });
  let writes = 0;
  await page.route('**/api/v1/settings/password', async (route) => {
    writes++;
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  await fillPasswordChange(page);
  await page
    .getByRole('button', { name: 'تأكيد التغيير والخروج', exact: true })
    .evaluate((element) => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  await reached;
  await expect(
    page.getByRole('button', { name: 'بنغيّر كلمة المرور…' }),
  ).toBeDisabled();
  await expect(
    page.getByLabel('كلمة المرور الحالية', { exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  release();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toContainText('اتغيّرت');
  const delivered = page.waitForResponse('**/api/v1/auth/me');
  releaseRead();
  await delivered;
  await expect(
    page.getByRole('button', { name: 'دخول لمساحتك' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/login');
  expect(writes).toBe(1);
});

test('SET-002 session expiration at confirmation does not refresh or replay the mutation', async ({
  page,
}) => {
  await register(page);
  await openSecuritySettings(page);
  await fillPasswordChange(page);
  await sessionModel.updateMany({}, { $set: { revokedAt: now } });
  let changes = 0,
    refreshes = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/settings/password')) changes++;
    if (req.url().endsWith('/auth/refresh')) refreshes++;
  });
  await confirmPasswordChange(page);
  await expect(page).toHaveURL('/login');
  expect(changes).toBe(1);
  expect(refreshes).toBe(0);
  await login(page);
  await expect(page).toHaveURL('/dashboard');
});

test('SET-002 server failure shows uncertain outcome and explicit old-password login works', async ({
  page,
}) => {
  await register(page);
  await openSecuritySettings(page);
  const original = passwordChange.store.change.bind(passwordChange.store);
  passwordChange.store.change = async () => {
    throw new Error('test transaction failure');
  };
  try {
    await fillPasswordChange(page);
    await confirmPasswordChange(page);
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('status')).toContainText('غير مؤكدة');
    await login(page);
    await expect(page).toHaveURL('/dashboard');
  } finally {
    passwordChange.store.change = original;
  }
});

for (const [width, height] of [
  [320, 256],
  [390, 844],
  [768, 1024],
  [844, 390],
  [1440, 900],
]) {
  test(`SET-002 responsive audit security editing, validation and confirmation ${width}x${height}`, async ({
    page,
  }, info) => {
    await register(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: width!, height: height! });
    await openSecuritySettings(page);
    await page.locator('.security-settings').scrollIntoViewIfNeeded();
    expect(
      (await inspectResponsiveLayout(page, 'security editing', false, width!))
        .issues,
    ).toEqual([]);
    await releaseAccessibility(page, 'security-responsive-editing');
    await page
      .getByRole('button', { name: 'مراجعة تغيير كلمة المرور' })
      .click();
    expect(
      (
        await inspectResponsiveLayout(
          page,
          'security validation',
          false,
          width!,
        )
      ).issues,
    ).toEqual([]);
    await releaseAccessibility(page, 'security-responsive-validation');
    await fillPasswordChange(page, account.password, '😀'.repeat(128));
    expect(
      (
        await inspectResponsiveLayout(
          page,
          'security confirmation',
          false,
          width!,
        )
      ).issues,
    ).toEqual([]);
    await releaseAccessibility(page, 'security-responsive-confirmation');
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/security/${info.project.name}-${width}x${height}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await confirmPasswordChange(page);
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('status')).toContainText('كل الأجهزة');
  });
}

test('SET-001 real profile save updates identity in both tabs and preserves an issued invoice', async ({
  page,
  context,
}) => {
  const invoice = await savedInvoiceInBrowser(page);
  await issueInvoiceInBrowser(page);
  const frozen = JSON.stringify(
    await invoiceModels.Invoice.findById(invoice.id).lean(),
  );
  const second = await context.newPage();
  await second.goto('/dashboard');
  await expect(second.getByRole('heading', { level: 1 })).toContainText(
    account.name,
  );
  await page.getByRole('link', { name: 'الإعدادات', exact: true }).click();
  await expect(page.getByLabel('الاسم الشخصي')).toHaveValue(account.name);
  await expect(
    page.locator('.profile-settings').getByRole('textbox'),
  ).toHaveCount(1);
  await releaseAccessibility(page, 'settings-ready');
  await page.getByLabel('الاسم الشخصي').fill('  عمر المصمم  ');
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('اسمك اتحدّث');
  await expect(page.locator('.sidebar-user strong')).toHaveText('عمر المصمم');
  await expect(page.locator('.user-avatar')).toHaveText('ع');
  await expect(second.getByRole('heading', { level: 1 })).toContainText(
    'عمر المصمم',
  );
  expect(
    JSON.stringify(await invoiceModels.Invoice.findById(invoice.id).lean()),
  ).toBe(frozen);
  expect((await models.Workspace.findOne().orFail()).name).toBe(
    account.workspaceName,
  );
  await page.reload();
  await expect(page.getByLabel('الاسم الشخصي')).toHaveValue('عمر المصمم');
  await page.getByRole('link', { name: 'نظرة عامة', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'عمر المصمم',
  );
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await login(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'عمر المصمم',
  );
  await second.close();
});

test('SET-001 stale tab preserves its draft and requires explicit revision review', async ({
  page,
  context,
}) => {
  await register(page);
  await openProfile(page);
  const second = await context.newPage();
  await openProfile(second);
  await second.getByLabel('الاسم الشخصي').fill('تعديل النافذة الثانية');
  await page.getByLabel('الاسم الشخصي').fill('تعديل النافذة الأولى');
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('اسمك اتحدّث');
  await second.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(
    second.locator('.profile-settings').getByRole('alert'),
  ).toContainText('الاسم اتغيّر');
  await expect(second.getByLabel('الاسم الشخصي')).toHaveValue(
    'تعديل النافذة الثانية',
  );
  await expect(
    second.getByRole('button', { name: 'حفظ الاسم', exact: true }),
  ).toBeDisabled();
  await second
    .getByRole('button', { name: 'اقرأ الحالة الحالية', exact: true })
    .click();
  await expect(second.locator('.profile-recovery')).toContainText(
    'تعديل النافذة الأولى',
  );
  await releaseAccessibility(second, 'settings-conflict-review');
  await second
    .getByRole('button', { name: 'احتفظ بتعديلي للمراجعة', exact: true })
    .click();
  await expect(second.getByLabel('الاسم الشخصي')).toHaveValue(
    'تعديل النافذة الثانية',
  );
  await second.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(second.getByRole('status')).toContainText('اسمك اتحدّث');
  expect((await models.User.findOne().orFail()).profileVersion).toBe(2);
  await expect(page.locator('.sidebar-user strong')).toHaveText(
    'تعديل النافذة الثانية',
  );
  await second.close();
});

test('SET-001 lost committed response never resends and current read requires explicit adoption', async ({
  page,
}) => {
  await register(page);
  await openProfile(page);
  let writes = 0;
  let failRead = false;
  await page.route('**/api/v1/settings/profile', async (route) => {
    if (route.request().method() === 'PUT') {
      writes++;
      await route.fetch();
      await route.abort('failed');
    } else if (failRead) {
      failRead = false;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByLabel('الاسم الشخصي').fill('اسم بعد فقد الرد');
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(
    page.locator('.profile-settings').getByRole('alert'),
  ).toContainText('مش قادرين نأكد');
  await expect(
    page.getByRole('button', { name: 'حفظ الاسم', exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  expect((await models.User.findOne().orFail()).profileVersion).toBe(1);
  failRead = true;
  await page
    .getByRole('button', { name: 'اقرأ الحالة الحالية', exact: true })
    .click();
  await expect(
    page.locator('.profile-settings').getByRole('alert'),
  ).toContainText('نتصل');
  await expect(page.getByLabel('الاسم الشخصي')).toHaveValue('اسم بعد فقد الرد');
  await page
    .getByRole('button', { name: 'اقرأ الحالة الحالية', exact: true })
    .click();
  await expect(page.locator('.profile-recovery')).toContainText(
    'الاسم المحفوظ الآن',
  );
  await page
    .getByRole('button', { name: 'اعتمد الاسم الحالي', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'حفظ الاسم', exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
});

test('SET-001 uncommitted loss and double submit retain intent without automatic retry', async ({
  page,
}) => {
  await register(page);
  await openProfile(page);
  let writes = 0;
  await page.route('**/api/v1/settings/profile', async (route) => {
    if (route.request().method() === 'PUT') {
      writes++;
      if (writes === 1) await route.abort('failed');
      else await route.continue();
    } else await route.continue();
  });
  await page.getByLabel('الاسم الشخصي').fill('تعديل لم يتسجل');
  await page
    .locator('form[aria-label="تعديل الملف الشخصي"]')
    .evaluate((form) => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
  await expect(
    page.locator('.profile-settings').getByRole('alert'),
  ).toContainText('مش قادرين نأكد');
  expect(writes).toBe(1);
  expect((await models.User.findOne().orFail()).profileVersion).toBe(0);
  await page
    .getByRole('button', { name: 'اقرأ الحالة الحالية', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'احتفظ بتعديلي للمراجعة', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'احتفظ بتعديلي للمراجعة', exact: true })
    .click();
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('اسمك اتحدّث');
  expect(writes).toBe(2);
  expect((await models.User.findOne().orFail()).profileVersion).toBe(1);
});

test('SET-001 validation, keyboard and unsaved link/back/logout confirmation keep the draft', async ({
  page,
}) => {
  await register(page);
  await openProfile(page);
  await page.getByLabel('الاسم الشخصي').fill('🌟');
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(page.getByLabel('الاسم الشخصي')).toBeFocused();
  await expect(
    page.locator('.profile-settings').getByRole('alert'),
  ).toContainText('حرفين');
  await releaseAccessibility(page, 'settings-invalid-name');
  await page.getByLabel('الاسم الشخصي').fill('تعديل غير محفوظ');
  let dialogs = 0;
  const confirmation35 = respondToAppConfirmation(page, async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'نظرة عامة', exact: true }).click();
  await confirmation35;
  await expect(page).toHaveURL('/settings');
  expect(dialogs).toBe(1);
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('beforeunload');
    dialogs++;
    await dialog.dismiss();
  });
  await page.evaluate(() => window.history.back());
  await expect.poll(() => dialogs).toBe(2);
  await expect(page).toHaveURL('/settings');
  const confirmation37 = respondToAppConfirmation(page, async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await confirmation37;
  expect(dialogs).toBe(3);
  await expect(page.getByLabel('الاسم الشخصي')).toHaveValue('تعديل غير محفوظ');
  await page
    .getByRole('button', { name: 'تراجع عن التعديل', exact: true })
    .click();
  await expect(page.getByLabel('الاسم الشخصي')).toHaveValue(account.name);
  await expect(page.getByLabel('الاسم الشخصي')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.getByRole('link', { name: 'نظرة عامة', exact: true }).click();
  await expect(page).toHaveURL('/dashboard');
  expect(dialogs).toBe(3);
});

test('SET-001 delayed successful write does not replace a newer name saved by another tab', async ({
  page,
  context,
}) => {
  await register(page);
  await openProfile(page);
  const second = await context.newPage();
  await openProfile(second);
  let release = () => {};
  const held = new Promise<void>((resolveWrite) => {
    release = resolveWrite;
  });
  let committed = false;
  await page.route('**/api/v1/settings/profile', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    committed = true;
    await held;
    await route.fulfill({ response });
  });
  await page.getByLabel('الاسم الشخصي').fill('اسم من الرد المتأخر');
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect.poll(() => committed).toBe(true);
  await second.getByLabel('الاسم الشخصي').fill('اسم أحدث فعليًا');
  await second.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(
    second.locator('.profile-settings').getByRole('alert'),
  ).toContainText('الاسم اتغيّر');
  await second
    .getByRole('button', { name: 'اقرأ الحالة الحالية', exact: true })
    .click();
  await second
    .getByRole('button', { name: 'احتفظ بتعديلي للمراجعة', exact: true })
    .click();
  await second.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(second.getByRole('status')).toContainText('اسمك اتحدّث');
  await expect(page.locator('.sidebar-user strong')).toHaveText(
    'اسم أحدث فعليًا',
  );
  release();
  await expect(page.getByRole('status')).toContainText('اسمك اتحدّث');
  await expect(page.locator('.sidebar-user strong')).toHaveText(
    'اسم أحدث فعليًا',
  );
  expect((await models.User.findOne().orFail()).profileVersion).toBe(2);
  await second.close();
});

test('SET-001 delayed identity read cannot overwrite a newly saved name', async ({
  page,
}) => {
  await register(page);
  await openProfile(page);
  let release = () => {};
  const held = new Promise<void>((resolveRead) => {
    release = resolveRead;
  });
  let captured = false;
  await page.route('**/api/v1/auth/me', async (route) => {
    const response = await route.fetch();
    captured = true;
    await held;
    await route.fulfill({ response });
  });
  await page
    .getByRole('button', { name: 'تحديث بيانات المساحة', exact: true })
    .click();
  await expect.poll(() => captured).toBe(true);
  await page.getByLabel('الاسم الشخصي').fill('اسم أحدث من القراءة');
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('اسمك اتحدّث');
  release();
  await expect(
    page.getByRole('button', { name: 'تحديث بيانات المساحة', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.sidebar-user strong')).toHaveText(
    'اسم أحدث من القراءة',
  );
});

test('SET-001 initial read failure recovers and anonymous settings require authentication', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page).toHaveURL('/login');
  await register(page);
  let allowRead = false;
  await page.route('**/api/v1/settings/profile', async (route) => {
    if (!allowRead) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR' },
        }),
      });
    } else await route.continue();
  });
  await page.goto('/settings');
  await expect(
    page.locator('.profile-settings').getByRole('alert'),
  ).toContainText('الخدمة مش متاحة');
  allowRead = true;
  await page
    .getByRole('button', { name: 'حاول تحميل البروفايل تاني', exact: true })
    .click();
  await expect(page.getByLabel('الاسم الشخصي')).toHaveValue(account.name);
});

for (const [width, height] of [
  [320, 256],
  [390, 844],
  [768, 1024],
  [844, 390],
  [1440, 900],
]) {
  test(`SET-001 responsive audit profile editing and recovery ${width}x${height}`, async ({
    page,
  }, info) => {
    await register(page);
    await models.User.updateOne(
      { email: account.email },
      {
        $set: {
          email:
            'designer.' +
            'a'.repeat(50) +
            '@' +
            'b'.repeat(50) +
            '.example.com',
        },
      },
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto('/settings');
    await expect(page.getByLabel('الاسم الشخصي')).toHaveValue(account.name);
    await page.getByLabel('الاسم الشخصي').fill('ع'.repeat(100));
    expect(
      (await inspectResponsiveLayout(page, 'settings draft', false, width!))
        .issues,
    ).toEqual([]);
    await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('اسمك اتحدّث');
    expect(
      (await inspectResponsiveLayout(page, 'settings saved', false, width!))
        .issues,
    ).toEqual([]);
    await page.getByLabel('الاسم الشخصي').fill('اسم آخر للمراجعة');
    await models.User.updateOne(
      {},
      { $set: { name: 'اسم من مكان آخر' }, $inc: { profileVersion: 1 } },
    );
    await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
    await expect(
      page.locator('.profile-settings').getByRole('alert'),
    ).toContainText('الاسم اتغيّر');
    await page
      .getByRole('button', { name: 'اقرأ الحالة الحالية', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'اعتمد الاسم الحالي', exact: true }),
    ).toBeVisible();
    expect(
      (await inspectResponsiveLayout(page, 'settings recovery', false, width!))
        .issues,
    ).toEqual([]);
    await releaseAccessibility(page, 'settings-responsive-review');
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/settings/${info.project.name}-${width}x${height}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await page
      .getByRole('button', { name: 'اعتمد الاسم الحالي', exact: true })
      .click();
    await expect(page.getByLabel('الاسم الشخصي')).toHaveValue(
      'اسم من مكان آخر',
    );
  });
}

test('SET-003 real rename updates tabs and reload while preserving issued documents, accepted agreement and public links', async ({
  page,
  context,
}) => {
  const invoice = await savedInvoiceInBrowser(page);
  await issueInvoiceInBrowser(page);
  const invoiceUrl = await shareInvoiceInBrowser(page);
  const draft = await proposals.create(invoice.workspace.id, {
    clientId: invoice.client.id,
    title: 'اتفاق محفوظ قبل تعديل المساحة',
    summary: '',
    terms: '',
    currency: 'EGP',
    items: [{ title: 'تصميم', quantity: 1, unitPrice: '100.00' }],
  });
  const sharing = createProposalSharing(proposalModel, () => shareNow);
  const grant = await sharing.issue(
    invoice.workspace.id,
    account.workspaceName,
    draft.id,
    draft.version,
    1,
  );
  await createProposalDecisions(
    database,
    proposalModel,
    projectModel,
    () => shareNow,
  ).execute(grant.token, 'accept', randomUUID());
  const frozenInvoice = JSON.stringify(
    await invoiceModels.Invoice.findById(invoice.id).lean(),
  );
  const frozenProposal = JSON.stringify(
    await proposalModel.findById(draft.id).lean(),
  );
  const frozenProject = JSON.stringify(await projectModel.find().lean());
  const publicProposal = await sharing.readPublic(grant.token);
  const invoiceSharing = createInvoiceSharing(invoiceModels, () => shareNow);
  const invoiceToken = new URL(invoiceUrl).hash.slice(1);
  const publicInvoiceBefore = await invoiceSharing.readPublic(invoiceToken);
  const second = await context.newPage();
  await second.goto('/dashboard');
  await expect(second.locator('.workspace-switch strong')).toHaveText(
    account.workspaceName,
  );
  await openWorkspaceSettings(page);
  await page
    .getByLabel('اسم مساحة العمل', { exact: true })
    .fill('  🌟استوديو التصميم  ');
  await page
    .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
    .click();
  await expect(
    page.locator('.workspace-settings').getByRole('status'),
  ).toContainText('اسم المساحة اتحدّث');
  await expect(page.locator('.workspace-switch strong')).toHaveText(
    '🌟استوديو التصميم',
  );
  await expect(page.locator('.workspace-avatar')).toHaveText('🌟');
  await expect(second.locator('.workspace-switch strong')).toHaveText(
    '🌟استوديو التصميم',
  );
  await expect(page.locator('.sidebar-user strong')).toHaveText(account.name);
  expect(
    JSON.stringify(await invoiceModels.Invoice.findById(invoice.id).lean()),
  ).toBe(frozenInvoice);
  expect(JSON.stringify(await proposalModel.findById(draft.id).lean())).toBe(
    frozenProposal,
  );
  expect(JSON.stringify(await projectModel.find().lean())).toBe(frozenProject);
  expect(await sharing.readPublic(grant.token)).toEqual(publicProposal);
  expect(await invoiceSharing.readPublic(invoiceToken)).toEqual(
    publicInvoiceBefore,
  );
  await releaseAccessibility(page, 'workspace-settings-saved');
  await page.reload();
  await expect(page.getByLabel('اسم مساحة العمل', { exact: true })).toHaveValue(
    '🌟استوديو التصميم',
  );
  await expect(page.locator('.workspace-switch strong')).toHaveText(
    '🌟استوديو التصميم',
  );
  await second.close();
});

for (const role of ['admin', 'member'] as const) {
  test(`SET-003 ${role} sees read-only workspace settings without edit controls`, async ({
    page,
  }) => {
    await register(page);
    await models.Membership.updateOne({}, { $set: { role } });
    await page.goto('/settings/workspace');
    const section = page.locator('.workspace-settings');
    await expect(section.locator('.workspace-settings-readonly')).toContainText(
      account.workspaceName,
    );
    await expect(section).toContainText(
      role === 'admin' ? 'مدير المساحة' : 'عضو المساحة',
    );
    await expect(section.getByRole('textbox')).toHaveCount(0);
    await expect(section.getByRole('button')).toHaveCount(0);
    await releaseAccessibility(page, `workspace-settings-${role}`);
    await openProfile(page);
  });
}

test('SET-003 stale tabs preserve drafts and require an explicit current revision before saving again', async ({
  page,
  context,
}) => {
  await register(page);
  await openWorkspaceSettings(page);
  const second = await context.newPage();
  await openWorkspaceSettings(second);
  await second
    .getByLabel('اسم مساحة العمل', { exact: true })
    .fill('اسم من التاب الثاني');
  await page
    .getByLabel('اسم مساحة العمل', { exact: true })
    .fill('اسم من التاب الأول');
  await page
    .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
    .click();
  await expect(
    page.locator('.workspace-settings').getByRole('status'),
  ).toContainText('اسم المساحة اتحدّث');
  await second
    .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
    .click();
  await expect(
    second.locator('.workspace-settings').getByRole('alert'),
  ).toContainText('اتغيّر من مكان تاني');
  await expect(
    second.getByLabel('اسم مساحة العمل', { exact: true }),
  ).toHaveValue('اسم من التاب الثاني');
  await expect(
    second.getByRole('button', { name: 'حفظ اسم المساحة', exact: true }),
  ).toBeDisabled();
  await second
    .getByRole('button', { name: 'اقرأ حالة المساحة الحالية', exact: true })
    .click();
  await expect(
    second.locator('.workspace-settings .profile-recovery'),
  ).toContainText('اسم من التاب الأول');
  await second
    .getByRole('button', { name: 'احتفظ بتعديل المساحة للمراجعة', exact: true })
    .click();
  await second
    .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
    .click();
  await expect(
    second.locator('.workspace-settings').getByRole('status'),
  ).toContainText('اسم المساحة اتحدّث');
  await expect(page.locator('.workspace-switch strong')).toHaveText(
    'اسم من التاب الثاني',
  );
  expect((await models.Workspace.findOne().orFail()).settingsVersion).toBe(2);
  await second.close();
});

for (const committed of [true, false]) {
  test(`SET-003 ${committed ? 'committed' : 'uncommitted'} lost response preserves intent without replay and recovers after an explicit read`, async ({
    page,
  }) => {
    await register(page);
    await openWorkspaceSettings(page);
    let writes = 0;
    let failRead = true;
    await page.route('**/api/v1/settings/workspace', async (route) => {
      if (route.request().method() === 'PUT') {
        writes++;
        if (committed) await route.fetch();
        await route.abort('failed');
      } else if (failRead) {
        failRead = false;
        await route.abort('failed');
      } else await route.continue();
    });
    await page
      .getByLabel('اسم مساحة العمل', { exact: true })
      .fill('اسم بعد فقد الرد');
    await page
      .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
      .click();
    await expect(
      page.locator('.workspace-settings').getByRole('alert'),
    ).toContainText('مش قادرين نأكد');
    await expect(
      page.getByRole('button', { name: 'حفظ اسم المساحة', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'اقرأ حالة المساحة الحالية', exact: true })
      .click();
    await expect(
      page.locator('.workspace-settings').getByRole('alert'),
    ).toContainText('نتصل');
    await expect(
      page.getByLabel('اسم مساحة العمل', { exact: true }),
    ).toHaveValue('اسم بعد فقد الرد');
    await page
      .getByRole('button', { name: 'اقرأ حالة المساحة الحالية', exact: true })
      .click();
    await expect(
      page.locator('.workspace-settings .profile-recovery'),
    ).toContainText(committed ? 'اسم بعد فقد الرد' : account.workspaceName);
    expect(writes).toBe(1);
    await page
      .getByRole('button', { name: 'اعتمد اسم المساحة الحالي', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'حفظ اسم المساحة', exact: true }),
    ).toBeDisabled();
    expect((await models.Workspace.findOne().orFail()).settingsVersion).toBe(
      committed ? 1 : 0,
    );
  });
}

test('SET-003 owner downgrade before save is denied and explicit read replaces editing with the current role', async ({
  page,
}) => {
  await register(page);
  await openWorkspaceSettings(page);
  await page
    .getByLabel('اسم مساحة العمل', { exact: true })
    .fill('اسم لا يجب حفظه');
  await models.Membership.updateOne({}, { $set: { role: 'member' } });
  await page
    .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
    .click();
  await expect(
    page.locator('.workspace-settings').getByRole('alert'),
  ).toContainText('صلاحية التعديل اتغيّرت');
  await page
    .getByRole('button', { name: 'اقرأ حالة المساحة الحالية', exact: true })
    .click();
  await expect(page.locator('.workspace-settings-readonly')).toContainText(
    account.workspaceName,
  );
  await expect(page.locator('.workspace-settings')).toContainText(
    'عضو المساحة',
  );
  await expect(page.locator('.sidebar-user')).toContainText('عضو المساحة');
  await expect(
    page.locator('.workspace-settings').getByRole('textbox'),
  ).toHaveCount(0);
  expect((await models.Workspace.findOne().orFail()).settingsVersion).toBe(0);
});

test('SET-003 section navigation protects workspace drafts and validation returns keyboard focus', async ({
  page,
}) => {
  await register(page);
  await openWorkspaceSettings(page);
  const name = page.getByLabel('اسم مساحة العمل', { exact: true });
  await name.fill('ع');
  await page
    .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
    .click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await name.fill('مساحة غير محفوظة');
  let dialogs = 0;
  const confirmation38 = respondToAppConfirmation(page, async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page
    .getByRole('navigation', { name: 'أقسام الإعدادات' })
    .getByRole('link', { name: 'الملف الشخصي', exact: true })
    .click();
  await confirmation38;
  await expect(page).toHaveURL('/settings/workspace');
  expect(dialogs).toBe(1);
  await page
    .getByRole('button', { name: 'تراجع عن تعديل المساحة', exact: true })
    .click();
  await name.fill(`  ${account.workspaceName}  `);
  await page
    .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
    .click();
  await expect(name).toHaveValue(account.workspaceName);
  expect((await models.Workspace.findOne().orFail()).settingsVersion).toBe(0);
  await page.route('**/api/v1/settings/workspace', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid name' },
        }),
      });
    else await route.continue();
  });
  await name.fill('اسم صالح');
  await page
    .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
    .click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  page.removeAllListeners('dialog');
  dialogs = 0;
  const confirmation39 = respondToAppConfirmation(page, async (dialog) => {
    dialogs++;
    await dialog.accept();
  });
  await page.getByRole('link', { name: 'نظرة عامة', exact: true }).click();
  await confirmation39;
  await expect(page).toHaveURL('/dashboard');
  expect(dialogs).toBe(1);
});

test('SET-003 double submit emits one write while pending and keeps all inputs locked', async ({
  page,
}) => {
  await register(page);
  await openWorkspaceSettings(page);
  let release = () => {};
  const held = new Promise<void>((resolveWrite) => {
    release = resolveWrite;
  });
  let writes = 0;
  await page.route('**/api/v1/settings/workspace', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    await held;
    await route.continue();
  });
  try {
    await page
      .getByLabel('اسم مساحة العمل', { exact: true })
      .fill('مساحة محفوظة مرة واحدة');
    await page
      .locator('form[aria-label="تعديل مساحة العمل"]')
      .evaluate((form) => {
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      });
    await expect.poll(() => writes).toBe(1);
    await expect(
      page.getByLabel('اسم مساحة العمل', { exact: true }),
    ).toBeDisabled();
    release();
    await expect(
      page.locator('.workspace-settings').getByRole('status'),
    ).toContainText('اسم المساحة اتحدّث');
    expect(writes).toBe(1);
    expect((await models.Workspace.findOne().orFail()).settingsVersion).toBe(1);
  } finally {
    release();
  }
});

test('SET-003 delayed old identity cannot replace a freshly saved workspace name', async ({
  page,
}) => {
  await register(page);
  await openWorkspaceSettings(page);
  let release = () => {};
  const held = new Promise<void>((resolveRead) => {
    release = resolveRead;
  });
  let captured = false;
  await page.route('**/api/v1/auth/me', async (route) => {
    const response = await route.fetch();
    captured = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole('button', { name: 'تحديث بيانات المساحة', exact: true })
      .click();
    await expect.poll(() => captured).toBe(true);
    await page
      .getByLabel('اسم مساحة العمل', { exact: true })
      .fill('مساحة أحدث من القراءة');
    await page
      .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
      .click();
    await expect(
      page.locator('.workspace-settings').getByRole('status'),
    ).toContainText('اسم المساحة اتحدّث');
    release();
    await expect(
      page.getByRole('button', { name: 'تحديث بيانات المساحة', exact: true }),
    ).toBeEnabled();
    await expect(page.locator('.workspace-switch strong')).toHaveText(
      'مساحة أحدث من القراءة',
    );
  } finally {
    release();
  }
});

test('SET-003 delayed background refresh keeps a workspace saved after its identity snapshot', async ({
  page,
}) => {
  await page.clock.install();
  await register(page);
  await openWorkspaceSettings(page);
  let release = () => {};
  const held = new Promise<void>((resolveRead) => {
    release = resolveRead;
  });
  let captured = false;
  let delivered = false;
  await page.route('**/api/v1/auth/refresh', async (route) => {
    const response = await route.fetch();
    captured = true;
    await held;
    await route.fulfill({ response });
    delivered = true;
  });
  try {
    await page.clock.fastForward(15 * 60 * 1000);
    await expect.poll(() => captured).toBe(true);
    await page
      .getByLabel('اسم مساحة العمل', { exact: true })
      .fill('مساحة أحدث من التجديد');
    await page
      .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
      .click();
    await expect(
      page.locator('.workspace-settings').getByRole('status'),
    ).toContainText('اسم المساحة اتحدّث');
    release();
    await expect.poll(() => delivered).toBe(true);
    await expect(page.locator('.workspace-switch strong')).toHaveText(
      'مساحة أحدث من التجديد',
    );
  } finally {
    release();
  }
});

test('SET-003 initial workspace read failure recovers explicitly and anonymous settings redirect to login', async ({
  page,
  browser,
}) => {
  await register(page);
  let allowRead = false;
  await page.route('**/api/v1/settings/workspace', async (route) => {
    if (!allowRead) {
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto('/settings/workspace');
  await expect(
    page.locator('.workspace-settings').getByRole('alert'),
  ).toContainText('نتصل');
  allowRead = true;
  await page
    .getByRole('button', { name: 'حاول تحميل المساحة تاني', exact: true })
    .click();
  await expect(page.getByLabel('اسم مساحة العمل', { exact: true })).toHaveValue(
    account.workspaceName,
  );
  const isolated = await browser.newContext();
  try {
    const anonymous = await isolated.newPage();
    await anonymous.goto('/settings');
    await expect(anonymous).toHaveURL('/login');
  } finally {
    await isolated.close();
  }
});

for (const [width, height] of [
  [320, 256],
  [390, 844],
  [768, 1024],
  [844, 390],
  [1440, 900],
]) {
  test(`SET-003 responsive audit long workspace name, conflict review and read-only role ${width}x${height}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await register(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: width!, height: height! });
    await openWorkspaceSettings(page);
    const longName = 'ع'.repeat(100);
    await page.getByLabel('اسم مساحة العمل', { exact: true }).fill(longName);
    expect(
      (await inspectResponsiveLayout(page, 'workspace draft', false, width!))
        .issues,
    ).toEqual([]);
    await page
      .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
      .click();
    await expect(
      page.locator('.workspace-settings').getByRole('status'),
    ).toContainText('اسم المساحة اتحدّث');
    await expect(page.locator('.workspace-switch strong')).toHaveText(longName);
    expect(
      (await inspectResponsiveLayout(page, 'workspace saved', false, width!))
        .issues,
    ).toEqual([]);
    await page
      .getByLabel('اسم مساحة العمل', { exact: true })
      .fill('اسم آخر للمراجعة');
    await models.Workspace.updateOne(
      {},
      { $set: { name: longName }, $inc: { settingsVersion: 1 } },
    );
    await page
      .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
      .click();
    await expect(
      page.locator('.workspace-settings').getByRole('alert'),
    ).toContainText('اتغيّر من مكان تاني');
    await page
      .getByRole('button', { name: 'اقرأ حالة المساحة الحالية', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'اعتمد اسم المساحة الحالي',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await inspectResponsiveLayout(page, 'workspace review', false, width!))
        .issues,
    ).toEqual([]);
    await releaseAccessibility(page, 'workspace-settings-responsive-review');
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/workspace-settings/${info.project.name}-${width}x${height}.png`,
      ),
      fullPage: true,
      animations: 'disabled',
    });
    await page
      .getByRole('button', { name: 'اعتمد اسم المساحة الحالي', exact: true })
      .click();
    await models.Membership.updateOne({}, { $set: { role: 'member' } });
    await page.reload();
    await expect(page.locator('.workspace-settings-readonly')).toContainText(
      longName,
    );
    expect(
      (
        await inspectResponsiveLayout(
          page,
          'workspace read-only',
          false,
          width!,
        )
      ).issues,
    ).toEqual([]);
    await releaseAccessibility(page, 'workspace-settings-responsive-readonly');
  });
}

test('SET-003 delayed successful write cannot roll back a newer workspace rename from another tab', async ({
  page,
  context,
}) => {
  await register(page);
  await openWorkspaceSettings(page);
  const second = await context.newPage();
  await openWorkspaceSettings(second);
  let release = () => {};
  const held = new Promise<void>((resolveWrite) => {
    release = resolveWrite;
  });
  let committed = false;
  await page.route('**/api/v1/settings/workspace', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch();
    committed = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByLabel('اسم مساحة العمل', { exact: true })
      .fill('اسم من الرد المتأخر');
    await page
      .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
      .click();
    await expect.poll(() => committed).toBe(true);
    await second
      .getByLabel('اسم مساحة العمل', { exact: true })
      .fill('مساحة أحدث فعليًا');
    await second
      .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
      .click();
    await expect(
      second.locator('.workspace-settings').getByRole('alert'),
    ).toContainText('اتغيّر من مكان تاني');
    await second
      .getByRole('button', { name: 'اقرأ حالة المساحة الحالية', exact: true })
      .click();
    await second
      .getByRole('button', {
        name: 'احتفظ بتعديل المساحة للمراجعة',
        exact: true,
      })
      .click();
    await second
      .getByRole('button', { name: 'حفظ اسم المساحة', exact: true })
      .click();
    await expect(
      second.locator('.workspace-settings').getByRole('status'),
    ).toContainText('اسم المساحة اتحدّث');
    await expect(page.locator('.workspace-switch strong')).toHaveText(
      'مساحة أحدث فعليًا',
    );
    release();
    await expect(
      page.locator('.workspace-settings').getByRole('status'),
    ).toContainText('اسم المساحة اتحدّث');
    await expect(page.locator('.workspace-switch strong')).toHaveText(
      'مساحة أحدث فعليًا',
    );
    expect((await models.Workspace.findOne().orFail()).settingsVersion).toBe(2);
  } finally {
    release();
    await second.close();
  }
});

test('SET-003 responsive audit long workspace name in mobile sidebar', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await register(page);
  const longName = '🌟' + 'L'.repeat(99);
  await models.Workspace.updateOne({}, { $set: { name: longName } });
  await page.goto('/settings/workspace');
  await expect(page.getByLabel('اسم مساحة العمل', { exact: true })).toHaveValue(
    longName,
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const observations = [];
  for (const [width, height] of [
    [320, 256],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page
      .getByRole('button', { name: 'فتح القائمة', exact: true })
      .click();
    const menu = page.getByRole('dialog', {
      name: 'قائمة مساحة العمل',
      exact: true,
    });
    await expect(menu).toBeVisible();
    await expect(menu.locator('.workspace-switch strong')).toHaveAttribute(
      'title',
      longName,
    );
    await expect(menu.locator('.workspace-avatar')).toHaveText('🌟');
    await menu
      .getByRole('button', { name: 'تسجيل الخروج', exact: true })
      .click({ trial: true });
    const observation = await inspectResponsiveLayout(
      page,
      `long workspace sidebar ${width}x${height}`,
      true,
      width,
    );
    observations.push(observation);
    expect(observation.issues).toEqual([]);
    await releaseAccessibility(page, `workspace-sidebar-${width}x${height}`);
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        `../../../.cache/ui/workspace-settings/sidebar-${info.project.name}-${width}x${height}.png`,
      ),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'فتح القائمة', exact: true }),
    ).toBeFocused();
  }
  await info.attach('workspace sidebar observations', {
    body: JSON.stringify(observations),
    contentType: 'application/json',
  });
});

test('list preferences restore filters and order across navigation reload and account changes', async ({
  page,
}) => {
  test.setTimeout(120000);
  await seedOverview(page);
  await page.goto('/clients');
  await page.getByRole('searchbox', { name: 'البحث عن عميل' }).fill('دفتر');
  await selectOption(
    page.getByRole('combobox', { name: 'بيانات التواصل', ...{ exact: true } }),
    'none',
  );
  await page.getByRole('button', { name: 'المؤرشفون', exact: true }).click();
  await selectOption(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
    'oldest',
  );
  await page.goto('/projects');
  await selectOption(
    page.getByRole('combobox', { name: 'حالة المشاريع' }),
    'completed',
  );
  await selectOption(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
    'oldest',
  );
  for (const path of ['/proposals', '/invoices']) {
    await page.goto(path);
    await selectOption(
      page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
      'oldest',
    );
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
    ).toHaveAttribute('value', 'oldest');
  }
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'غير المقروء', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'غير المقروء', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  // The preview must still show all events, independently of the saved inbox filter.
  const previewRead = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/notifications' &&
      url.searchParams.get('filter') === 'all'
    );
  });
  await page
    .getByRole('button', { name: /الإشعارات/, exact: false })
    .first()
    .click();
  await previewRead;
  await page.keyboard.press('Escape');
  const restoredRead = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/clients' && url.searchParams.get('q') === 'دفتر'
    );
  });
  await page.goto('/clients');
  const query = new URL((await restoredRead).url()).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({
    q: 'دفتر',
    contact: 'none',
    status: 'archived',
    order: 'oldest',
  });
  await expect(
    page.getByRole('searchbox', { name: 'البحث عن عميل' }),
  ).toHaveValue('دفتر');
  await expect(
    page.getByRole('button', { name: 'المؤرشفون', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'بيانات التواصل', ...{ exact: true } }),
  ).toHaveAttribute('value', 'none');
  await page.goto('/projects');
  await expect(
    page.getByRole('combobox', { name: 'حالة المشاريع' }),
  ).toHaveAttribute('value', 'completed');
  await expect(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
  ).toHaveAttribute('value', 'oldest');
  const other = { ...account, email: 'preferences-other@example.com' };
  await registerAccount.execute(other);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.getByLabel('البريد الإلكتروني').fill(other.email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(other.password);
  await page.getByRole('button', { name: 'دخول لمساحتك' }).click();
  await expect(page).toHaveURL('/dashboard');
  await page.goto('/clients');
  await expect(
    page.getByRole('searchbox', { name: 'البحث عن عميل' }),
  ).toHaveValue('');
  await expect(
    page.getByRole('combobox', { name: 'بيانات التواصل', ...{ exact: true } }),
  ).toHaveAttribute('value', 'all');
  await expect(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
  ).toHaveAttribute('value', 'newest');
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await login(page);
  await expect(page).toHaveURL('/dashboard');
  await page.goto('/clients');
  await expect(
    page.getByRole('searchbox', { name: 'البحث عن عميل' }),
  ).toHaveValue('دفتر');
  await page
    .getByRole('button', { name: 'إعادة ضبط العرض', exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole('searchbox', { name: 'البحث عن عميل' }),
  ).toHaveValue('');
  await expect(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
  ).toHaveAttribute('value', 'newest');
});

test('list order reads every page in both directions and preserves workspace and filter scope', async ({
  page,
}) => {
  test.setTimeout(120000);
  const { scope, clientId } = await seedOverview(page);
  await seedOverviewTasks(scope, clientId);
  const workspace = new Types.ObjectId(scope);
  const collections = [
    clientModel.collection.name,
    projectModel.collection.name,
    proposalModel.collection.name,
    invoiceModels.Invoice.collection.name,
  ];
  const foreign = new Types.ObjectId();
  for (const name of collections) {
    const collection = database.collection(name);
    const base = await collection.findOne({ workspace });
    expect(base).toBeTruthy();
    await collection.insertMany(
      Array.from({ length: 28 }, (_, index) => ({
        ...base!,
        _id: new Types.ObjectId(),
        share: null,
        ...(name === clientModel.collection.name
          ? { name: 'عميل ترتيب ' + index }
          : { title: 'مستند ترتيب ' + index }),
        ...(name === projectModel.collection.name
          ? { sourceProposal: null }
          : {}),
        ...(name === invoiceModels.Invoice.collection.name
          ? {
              requestId: randomUUID(),
              sequence: 100 + index,
              number: 'INV-TEST-' + index,
            }
          : {}),
      })),
    );
    await collection.insertOne({
      ...base!,
      _id: new Types.ObjectId(),
      workspace: foreign,
      share: null,
    });
  }
  const token = (await sessions.login.execute(account)).accessToken;
  const headers = { Authorization: 'Bearer ' + token };
  const expectedIds = new Map<string, string[]>();
  for (const [index, name] of [
    'clients',
    'projects',
    'proposals',
    'invoices',
  ].entries()) {
    const endpoint = 'http://localhost:5100/api/v1/' + name;
    for (const invalid of [
      'order=ascending',
      'order=oldest&order=newest',
      'order=oldest&workspace=' + scope,
    ])
      expect(
        (
          await page.request.get(endpoint + '?' + invalid, { headers })
        ).status(),
      ).toBe(422);
    const allIds = (
      await database
        .collection(collections[index]!)
        .find({ workspace })
        .project({ _id: 1 })
        .sort({ _id: 1 })
        .toArray()
    ).map((row) => String(row._id));
    expectedIds.set(name, allIds);
    for (const order of ['oldest', 'newest']) {
      const firstResponse = await page.request.get(endpoint, {
        headers,
        params: { order },
      });
      expect(firstResponse.status()).toBe(200);
      const first = (await firstResponse.json()).data;
      expect(first.items).toHaveLength(25);
      expect(first.nextCursor).toBeTruthy();
      const second = (
        await (
          await page.request.get(endpoint, {
            headers,
            params: { order, cursor: first.nextCursor },
          })
        ).json()
      ).data;
      const ids = [...first.items, ...second.items].map(
        (item: { id: string }) => item.id,
      );
      expect(ids).toEqual(order === 'oldest' ? allIds : allIds.toReversed());
      expect(second.nextCursor).toBeNull();
    }
  }
  for (const [name, selector, more] of [
    ['clients', '.client-row', 'عرض المزيد'],
    ['projects', '.project-row', 'مشاريع أكتر'],
    ['proposals', '.proposal-row', 'عروض أكتر'],
    ['invoices', '.proposal-row', 'فواتير أكتر'],
  ] as const) {
    await page.goto('/' + name);
    await selectOption(
      page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
      'oldest',
    );
    await expect(page.locator(selector)).toHaveCount(25);
    await page.getByRole('button', { name: more, exact: true }).click();
    await expect(page.locator(selector)).toHaveCount(
      expectedIds.get(name)!.length,
    );
    if (name !== 'clients') {
      const ids = await page
        .locator(selector)
        .evaluateAll((rows) =>
          rows.map((row) => row.getAttribute('href')!.split('/').at(-1)),
        );
      expect(ids).toEqual(expectedIds.get(name));
    }
    await selectOption(
      page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
      'newest',
    );
    await expect(page.locator(selector)).toHaveCount(25);
  }
  const projectId = expectedIds.get('projects')![0]!;
  await projectModel.updateOne(
    { _id: projectId, workspace },
    { $set: { status: 'completed' } },
  );
  const projectResponse = await page.request.get(
    'http://localhost:5100/api/v1/projects',
    { headers, params: { order: 'oldest', status: 'completed' } },
  );
  expect(
    (await projectResponse.json()).data.items.map(
      (item: { id: string }) => item.id,
    ),
  ).toEqual([projectId]);
  await clientModel.updateOne(
    { _id: clientId, workspace },
    { $set: { archivedAt: new Date(), phone: '+201000000000' } },
  );
  const clientResponse = await page.request.get(
    'http://localhost:5100/api/v1/clients',
    {
      headers,
      params: {
        order: 'oldest',
        status: 'archived',
        contact: 'phone',
        q: 'دفتر',
      },
    },
  );
  expect(
    (await clientResponse.json()).data.items.map(
      (item: { id: string }) => item.id,
    ),
  ).toEqual([clientId]);
});

test('list preferences tolerate corrupt and blocked storage and remain usable at mobile sizes', async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { scope } = await seedOverview(page);
  const { identity } = await sessions.login.execute(account);
  const clientKey = `lancelio:list:v1:${identity.user.id}:${scope}:clients`;
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), clientKey);
  await page.goto('/clients');
  await expect(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
  ).toHaveAttribute('value', 'newest');
  await page.getByRole('searchbox', { name: 'البحث عن عميل' }).fill('دفتر');
  await selectOption(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
    'oldest',
  );
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
    [320, 568],
    [320, 256],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const path of ['/clients', '/projects', '/proposals', '/invoices']) {
      await page.goto(path);
      await expect(
        page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
      ).toBeVisible();
      await selectOption(
        page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
        'oldest',
      );
      expect(
        (await inspectResponsiveLayout(page, path, width <= 960, width)).issues,
      ).toEqual([]);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if (path === '/clients')
        await page.screenshot({
          path: resolve(
            import.meta.dirname,
            `../../../.cache/ui/list-preferences/clients-${width}-${height}.png`,
          ),
          animations: 'disabled',
          fullPage: true,
        });
    }
  }
  // Storage denied by the browser must not disable controls or lose choices on navigation.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/clients');
  await expect(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
  ).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await selectOption(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
    'newest',
  );
  await selectOption(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
    'oldest',
  );
  await page.getByRole('link', { name: 'المشاريع', exact: true }).click();
  await page.getByRole('link', { name: 'العملاء', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'ترتيب العرض', ...{ exact: true } }),
  ).toHaveAttribute('value', 'oldest');
});

test('theme preference follows the device and persists across refresh navigation logout and tabs', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /hydration|hydrated|did not match/i.test(message.text())
    )
      hydrationErrors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await register(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page
    .getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/clients');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/settings/appearance');
  await expect(page.getByRole('radio', { name: /^داكن/ })).toBeChecked();
  await page.getByRole('radio', { name: /^حسب الجهاز/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: /^داكن/ }).check();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const other = await context.newPage();
  await other.goto('/settings/appearance');
  await expect(other.getByRole('radio', { name: /^داكن/ })).toBeChecked();
  await other.getByRole('radio', { name: /^فاتح/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: /^فاتح/ })).toBeChecked();
  await other.close();
  await page.getByRole('radio', { name: /^داكن/ }).check();
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.mobile-brand .brand-image-night')).toHaveCSS(
    'display',
    'block',
  );
  expect(hydrationErrors).toEqual([]);
});

test('theme is applied before hydration and tolerates malformed or blocked browser storage', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() =>
    localStorage.setItem('lancelio:theme:v1', 'invalid-value'),
  );
  await page.route('**/_next/static/**/*.js', (route) => route.abort());
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(16, 27, 21)',
  );
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.unroute('**/_next/static/**/*.js');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'تفعيل الوضع الفاتح', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await page
    .getByRole('button', { name: 'تفعيل الوضع الفاتح', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page
    .getByRole('link', { name: 'ابدأ مساحة جديدة', exact: true })
    .click();
  await expect(page).toHaveURL('/register');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page
    .getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('theme dark palette keeps real lists forms documents and feedback accessible', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const { scope, clientId, first } = await seedOverview(page);
  await seedOverviewTasks(scope, clientId);
  const project = await projectModel.findOne({ workspace: scope }).orFail();
  const proposal = await proposalModel.findOne({ workspace: scope }).orFail();
  await page
    .getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true })
    .click();
  const contrastIssues: unknown[] = [];
  for (const path of [
    '/dashboard',
    '/clients',
    '/projects',
    '/proposals',
    '/invoices',
    '/notifications',
    '/settings',
    '/settings/security',
    '/settings/workspace',
    '/settings/appearance',
    '/proposals/new',
    '/projects/new',
    '/invoices/new',
    '/projects/' + project.id,
    '/proposals/' + proposal.id,
    '/invoices/' + first,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.loading-placeholder')).toHaveCount(0);
    const audit = await new AxeBuilder({ page }).analyze();
    contrastIssues.push(
      ...audit.violations.map((violation) => ({
        path,
        rule: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          detail: node.failureSummary,
        })),
      })),
    );
  }
  expect(contrastIssues).toEqual([]);
  await page.goto('/settings');
  await page
    .getByLabel('الاسم الشخصي', { exact: true })
    .fill('اسم مع وضع داكن');
  await page
    .getByRole('navigation', { name: 'أقسام الإعدادات' })
    .getByRole('link', { name: 'أمان الحساب', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'نكمّل الخطوة دي؟',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'رجوع', exact: true }).click();
  await page.getByRole('button', { name: 'حفظ الاسم', exact: true }).click();
  await expect(page.locator('.success-toast')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('theme responsive audit keeps header dialogs and appearance choices usable in dark and light', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedOverview(page);
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
    [320, 568],
    [320, 256],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const mode of ['dark', 'light'] as const) {
      await page.goto('/settings/appearance');
      await page
        .getByRole('radio', { name: mode === 'dark' ? /^داكن/ : /^فاتح/ })
        .check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'appearance-' + mode,
            width <= 960,
            width,
          )
        ).issues,
      ).toEqual([]);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page
        .getByRole('button', { name: 'البحث في مساحة العمل', exact: true })
        .click();
      const search = page.getByRole('dialog', {
        name: 'البحث في مساحة العمل',
        exact: true,
      });
      await search.getByRole('searchbox').fill('عميل دفتر');
      await expect(search.locator('.workspace-search-group')).toHaveCount(3);
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'theme-search-' + mode,
            width <= 960,
            width,
          )
        ).issues,
      ).toEqual([]);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      await page.goto('/dashboard');
      await expect(page.locator('.overview-counts')).toBeVisible();
      await page.screenshot({
        path: resolve(
          import.meta.dirname,
          `../../../.cache/ui/theme/${mode}-${width}-${height}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'فتح القائمة', exact: true }).click();
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page
    .getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true })
    .click();
  expect(
    (await inspectResponsiveLayout(page, 'theme-auth', true, 320)).issues,
  ).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/theme/auth-dark-320.png',
    ),
    fullPage: true,
    animations: 'disabled',
  });
});

test('custom selects responsive audit keeps styled menus inside the viewport with keyboard support', async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(10000);
  for (const locale of ['ar', 'en'] as const) {
    await context.addCookies([
      { name: 'lancelio_language', value: locale, url: testOrigin },
    ]);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      for (const [width, height] of [
        [320, 256],
        [390, 844],
        [1280, 800],
      ]) {
        await page.setViewportSize({ width: width!, height: height! });
        await page.goto('/login');
        const control = page.getByRole('combobox', {
          name: locale === 'ar' ? 'لغة الموقع' : 'Site language',
          exact: true,
        });
        await expect(control).toBeEnabled();
        await control.focus();
        await control.press('ArrowDown');
        const popup = page.getByRole('listbox');
        await expect(popup).toBeVisible();
        await expect(popup.getByRole('option')).toHaveText([
          'العربية',
          'English',
        ]);
        await control.press('End');
        const active = await control.getAttribute('aria-activedescendant');
        expect(active).toBeTruthy();
        await expect(
          page.locator(`[id=${JSON.stringify(active)}]`),
        ).toContainText('English');
        await control.press('Escape');
        await expect(control).toBeFocused();
        await expect(control).toHaveAttribute('value', locale);
        await expect(control).toHaveAttribute('aria-expanded', 'false');
        await control.press('E');
        await expect(popup).toBeVisible();
        await expect(
          page.locator(
            `[id=${JSON.stringify(await control.getAttribute('aria-activedescendant'))}]`,
          ),
        ).toContainText('English');
        await control.press('Escape');
        await control.click();
        const bounds = await popup.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width! + 1);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height! + 1);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        if (width === 390)
          await page.screenshot({
            path: resolve(
              import.meta.dirname,
              `../../../.cache/ui/select/${locale}-${theme}.png`,
            ),
            animations: 'disabled',
          });
        await page.mouse.click(width! - 2, height! - 2);
        await expect(control).toHaveAttribute('aria-expanded', 'false');
      }
    }
  }
});

test('assistant reads real workspace data, links to sources and preserves conversation across navigation and language changes', async ({
  page,
}) => {
  test.setTimeout(120000);
  const { scope, clientId } = await seedOverview(page);
  await seedOverviewTasks(scope, clientId);
  const before = JSON.stringify(await invoiceModels.Invoice.find().lean());
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  let chat = page.getByRole('dialog', { name: 'مساعد Lancelio', exact: true });
  await expect(
    chat.getByText('إرشادات واستعلامات محددة · الفهم الذكي لسه غير مفعّل', {
      exact: true,
    }),
  ).toBeVisible();
  await chat.getByRole('button', { name: 'ملخص شغلي', exact: true }).click();
  await expect(chat.locator('.assistant-facts')).toBeVisible();
  await expect(chat.locator('.assistant-balances > div')).toHaveCount(4);
  await expect(chat.locator('.assistant-balances')).toContainText('٠٫٠١');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'افتح مساعد Lancelio', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  await expect(chat.locator('.assistant-facts')).toBeVisible();
  await chat
    .getByLabel('سؤالك للمساعد', { exact: true })
    .fill('إيه المشاريع المفتوحة؟');
  await chat.getByRole('button', { name: 'إرسال السؤال', exact: true }).click();
  await expect(
    chat.locator('.assistant-turn').last().locator('.assistant-records'),
  ).toContainText('مشروع توزيع المهام');
  const projectLink = chat
    .locator('.assistant-turn')
    .last()
    .locator('.assistant-records a')
    .first();
  await projectLink.click();
  await expect(page).toHaveURL(/\/projects\/[a-f\d]{24}$/u);
  await expect(chat).toHaveCount(0);
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  await expect(chat.locator('.assistant-turn')).toHaveCount(2);
  await chat
    .getByLabel('سؤالك للمساعد', { exact: true })
    .fill('مين العملاء اللي عليهم مستحقات؟');
  await chat.getByLabel('سؤالك للمساعد', { exact: true }).press('Enter');
  await expect(
    chat.locator('.assistant-turn').last().locator('.assistant-records li'),
  ).toHaveCount(4);
  await expect(chat.locator('.assistant-turn').last()).toContainText(
    'عميل دفتر المتابعة',
  );
  await chat
    .getByLabel('سؤالك للمساعد', { exact: true })
    .fill('ابحث عن عميل دفتر المتابعة');
  await chat.getByLabel('سؤالك للمساعد', { exact: true }).press('Enter');
  await expect(
    chat.locator('.assistant-turn').last().locator('.assistant-records li'),
  ).not.toHaveCount(0);
  await expect(chat.locator('.assistant-turn').last()).toContainText(
    'نتائج من دفاتر مساحتك',
  );
  await chat
    .getByLabel('سؤالك للمساعد', { exact: true })
    .fill('سؤال لسه مكتوب');
  await page.keyboard.press('Escape');
  await selectOption(
    page.locator('.sidebar-language').getByRole('combobox'),
    'en',
  );
  await page
    .getByRole('button', { name: 'Open Lancelio assistant', exact: true })
    .click();
  chat = page.getByRole('dialog', { name: 'Lancelio assistant', exact: true });
  await expect(
    chat.getByLabel('Your question for the assistant', { exact: true }),
  ).toHaveValue('سؤال لسه مكتوب');
  await expect(chat.locator('.assistant-turn').first()).toContainText(
    'دي لقطة من شغلك دلوقتي',
  );
  await expect(chat.locator('.assistant-turn').last()).toContainText(
    'عميل دفتر المتابعة',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(JSON.stringify(await invoiceModels.Invoice.find().lean())).toBe(
    before,
  );
  await chat
    .getByRole('button', { name: 'New conversation', exact: true })
    .click();
  await expect(chat.locator('.assistant-turn')).toHaveCount(0);
  await expect(
    chat.getByLabel('Your question for the assistant', { exact: true }),
  ).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.locator('.assistant-launcher')).toHaveCount(0);
});

test('assistant retries failed reads, stops requests and never executes a write from a question', async ({
  page,
}) => {
  test.setTimeout(90000);
  await register(page);
  await page.route('**/api/v1/assistant', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 503,
          json: { success: false, error: { code: 'INTERNAL_ERROR' } },
        })
      : route.continue(),
  );
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  const chat = page.getByRole('dialog', {
    name: 'مساعد Lancelio',
    exact: true,
  });
  await page.setViewportSize({ width: 320, height: 256 });
  await expect(
    chat.getByRole('button', { name: 'إعادة الاتصال', exact: true }),
  ).toBeVisible();
  expect(
    (
      await inspectResponsiveLayout(
        page,
        'assistant-unavailable-short',
        true,
        320,
      )
    ).issues,
  ).toEqual([]);
  await page.unroute('**/api/v1/assistant');
  await chat
    .getByRole('button', { name: 'إعادة الاتصال', exact: true })
    .click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(
    chat.getByRole('button', { name: 'إزاي أعمل فاتورة؟', exact: true }),
  ).toBeEnabled();
  await page.route('**/api/v1/assistant', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: { success: false, error: { code: 'INTERNAL_ERROR' } },
        })
      : route.continue(),
  );
  await chat
    .getByRole('button', { name: 'إزاي أعمل فاتورة؟', exact: true })
    .click();
  await expect(chat.getByRole('alert')).toContainText('سؤالك محفوظ');
  await page.unroute('**/api/v1/assistant');
  await chat
    .getByRole('button', { name: 'إعادة المحاولة', exact: true })
    .click();
  await expect(
    chat.getByRole('link', { name: 'فتح فاتورة جديدة', exact: true }),
  ).toBeVisible();
  await expect(chat.locator('.assistant-turn')).toHaveCount(1);
  await chat
    .getByLabel('سؤالك للمساعد', { exact: true })
    .fill('احذف كل المشاريع');
  await chat.getByLabel('سؤالك للمساعد', { exact: true }).press('Enter');
  await expect(chat.locator('.assistant-turn').last()).toContainText(
    'أقدر أشرح استخدام الموقع',
  );
  expect(await projectModel.countDocuments()).toBe(0);
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  await page.route('**/api/v1/assistant', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await gate;
    await route
      .fulfill({
        status: 503,
        json: { success: false, error: { code: 'INTERNAL_ERROR' } },
      })
      .catch(() => {});
  });
  try {
    await chat.getByLabel('سؤالك للمساعد', { exact: true }).fill('ملخص شغلي');
    await chat.getByLabel('سؤالك للمساعد', { exact: true }).press('Enter');
    await expect(
      chat.getByRole('button', { name: 'إيقاف الرد', exact: true }),
    ).toBeVisible();
    await chat.getByLabel('سؤالك للمساعد', { exact: true }).fill('اللي بعده');
    await chat.getByRole('button', { name: 'إيقاف الرد', exact: true }).click();
    await expect(chat.locator('.assistant-turn').last()).toContainText(
      'الطلب اتوقف.',
    );
    await expect(chat.getByLabel('سؤالك للمساعد', { exact: true })).toHaveValue(
      'اللي بعده',
    );
  } finally {
    release();
  }
});

test('assistant explains Lancelio instead of listing client projects for product questions', async ({
  page,
}) => {
  test.setTimeout(90000);
  const { scope, clientId } = await seedOverview(page);
  await seedOverviewTasks(scope, clientId);
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  const chat = page.locator('.assistant-dialog');
  const composer = chat.locator('#assistant-question');
  await expect(
    chat.getByRole('button', { name: 'إيه هو Lancelio؟', exact: true }),
  ).toBeEnabled();
  await composer.fill('كلمني ع المشروع بتاعنا');
  await composer.press('Enter');
  const arabic = chat
    .locator('.assistant-turn')
    .nth(0)
    .locator('.assistant-answer');
  await expect(arabic).toContainText('عن Lancelio');
  await expect(arabic).toContainText('مساحة عمل للفريلانسر');
  await expect(arabic).toContainText('لما العميل يقبل العرض');
  await expect(arabic).toContainText('تسجل الدفعات اللي استلمتها يدويًا');
  await expect(arabic).toHaveAttribute('dir', 'rtl');
  await expect(
    arabic.locator('.assistant-records, .assistant-facts'),
  ).toHaveCount(0);
  await expect(arabic).not.toContainText('ابدأ مشروعك');
  await composer.fill('وايه مميزاته؟');
  await composer.press('Enter');
  await expect(
    chat.locator('.assistant-turn').nth(1).locator('.assistant-answer'),
  ).toContainText('عن Lancelio');
  await composer.fill('Tell me about our project');
  await composer.press('Enter');
  const english = chat
    .locator('.assistant-turn')
    .nth(2)
    .locator('.assistant-answer');
  await expect(english).toContainText('About Lancelio');
  await expect(english).toContainText('freelancer workspace');
  await expect(english).toContainText('cannot create or edit records');
  await expect(english).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await inspectResponsiveLayout(page, 'assistant-product', true, 390))
      .issues,
  ).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await english
    .getByRole('link', { name: 'Open overview', exact: true })
    .scrollIntoViewIfNeeded();
  await chat.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/assistant/product-knowledge.png',
    ),
    animations: 'disabled',
  });
  await composer.fill('إيه المشاريع المفتوحة؟');
  await composer.press('Enter');
  await expect(
    chat.locator('.assistant-turn').last().locator('.assistant-records'),
  ).toContainText('مشروع توزيع المهام');
});

test('assistant replies in the question language while keeping interface and saved replies independent', async ({
  page,
}) => {
  test.setTimeout(90000);
  await seedOverview(page);
  await selectOption(
    page.locator('.sidebar-language').getByRole('combobox'),
    'en',
  );
  await page
    .getByRole('button', { name: 'Open Lancelio assistant', exact: true })
    .click();
  const chat = page.locator('.assistant-dialog');
  const composer = chat.locator('#assistant-question');
  await composer.fill('إزاي أعمل فاتورة؟');
  await composer.press('Enter');
  const arabic = chat
    .locator('.assistant-turn')
    .nth(0)
    .locator('.assistant-answer');
  await expect(
    arabic.getByRole('link', { name: 'فتح فاتورة جديدة', exact: true }),
  ).toBeVisible();
  await expect(arabic).toHaveAttribute('lang', 'ar');
  await expect(arabic).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await composer.fill('How do I create an invoice?');
  await composer.press('Enter');
  const english = chat
    .locator('.assistant-turn')
    .nth(1)
    .locator('.assistant-answer');
  await expect(
    english.getByRole('link', { name: 'Open a new invoice', exact: true }),
  ).toBeVisible();
  await expect(english).toHaveAttribute('dir', 'ltr');
  await composer.fill('ملخص شغلي');
  await composer.press('Enter');
  await expect(
    chat.locator('.assistant-turn').nth(2).locator('.assistant-balances'),
  ).toContainText('٠٫٠١');
  await page.keyboard.press('Escape');
  await selectOption(
    page.locator('.sidebar-language').getByRole('combobox'),
    'ar',
  );
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  await expect(
    arabic.getByRole('link', { name: 'فتح فاتورة جديدة', exact: true }),
  ).toBeVisible();
  await expect(
    english.getByRole('link', { name: 'Open a new invoice', exact: true }),
  ).toBeVisible();
  await page.route('**/api/v1/assistant', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: { success: false, error: { code: 'INTERNAL_ERROR' } },
        })
      : route.continue(),
  );
  await composer.fill('What are my open projects?');
  await composer.press('Enter');
  await expect(
    chat.locator('.assistant-turn').last().getByRole('alert'),
  ).toContainText('Your question is still here');
  await expect(
    chat.locator('.assistant-turn').last().locator('.assistant-message'),
  ).toHaveAttribute('lang', 'en');
  await page.unroute('**/api/v1/assistant');
  await chat.locator('.assistant-turn').last().getByRole('button').click();
  await expect(
    chat.locator('.assistant-turn').last().locator('.assistant-answer'),
  ).toContainText('Projects matching your question');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await inspectResponsiveLayout(
        page,
        'assistant-mixed-languages',
        true,
        390,
      )
    ).issues,
  ).toEqual([]);
  await chat.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/language/assistant-question-language.png',
    ),
    animations: 'disabled',
  });
});

test('assistant chats naturally with a personalized welcome, temporary reply context and escaped generated text', async ({
  page,
}) => {
  test.setTimeout(90000);
  await register(page);
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  const chat = page.locator('.assistant-dialog');
  const composer = chat.locator('#assistant-question');
  await expect(
    chat.getByRole('heading', { name: 'أهلًا يا أحمد 👋', exact: true }),
  ).toBeVisible();
  await expect(chat.locator('.assistant-mode')).toContainText('إرشادات');
  await composer.fill('ازيك');
  await composer.press('Enter');
  await expect(chat.locator('.assistant-prose')).toContainText('يا أحمد');
  const requests: {
    message: string;
    history: string[];
    conversation: { question: string; answer: string }[];
    locale: string;
  }[] = [];
  const generated = [
    'ابدأ بمهمتين بس: مراجعة عرض السعر، وبعدها الفاتورة.\n\nتحب نرتبهم حسب موعد التسليم؟',
    'راجع عرض السعر الأول، وبعدها اكتب مسودة رسالة للعميل.',
    '<img src=x onerror="alert(1)">\n\nStart with the task due first.',
  ];
  await page.route('**/api/v1/assistant', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: { success: true, data: { mode: 'gemini' } },
      });
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        success: true,
        data: {
          message: generated[requests.length - 1] ?? 'تمام، نبدأ من جديد.',
          plan: {
            intent: 'chat',
            topic: 'navigation',
            status: 'open',
            query: '',
          },
          engine: 'gemini',
          degraded: false,
          asOf: null,
          records: [],
          hasMore: false,
          facts: null,
        },
      },
    });
  });
  await composer.fill('لو عندي ساعتين بس للشغل أرتبهم إزاي؟');
  await composer.press('Enter');
  await expect(chat.locator('.assistant-prose').last().locator('p')).toHaveText(
    generated[0]!.split('\n\n'),
  );
  await composer.fill('طب أبدأ بأنهي واحدة؟');
  await composer.press('Enter');
  await expect(chat.locator('.assistant-prose').last()).toContainText(
    'راجع عرض السعر الأول',
  );
  expect(requests[1]).toEqual({
    message: 'طب أبدأ بأنهي واحدة؟',
    history: ['ازيك', 'لو عندي ساعتين بس للشغل أرتبهم إزاي؟'],
    conversation: [{ question: requests[0]!.message, answer: generated[0] }],
    locale: 'ar',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await inspectResponsiveLayout(page, 'assistant-conversation', true, 390))
      .issues,
  ).toEqual([]);
  await chat.screenshot({
    path: resolve(
      import.meta.dirname,
      '../../../.cache/ui/assistant/natural-conversation.png',
    ),
    animations: 'disabled',
  });
  await composer.fill('Can you explain that in English?');
  await composer.press('Enter');
  const prose = chat.locator('.assistant-prose').last();
  await expect(prose).toContainText('<img src=x onerror="alert(1)">');
  await expect(prose.locator('img')).toHaveCount(0);
  await expect(chat.locator('.assistant-answer').last()).toHaveAttribute(
    'lang',
    'en',
  );
  await expect(chat.locator('.assistant-answer').nth(1)).toHaveAttribute(
    'lang',
    'ar',
  );
  expect(requests[2]!.locale).toBe('en');
  await chat.getByRole('button', { name: 'محادثة جديدة', exact: true }).click();
  await expect(chat.locator('.assistant-mode')).toContainText('محادثة ذكية');
  await expect(chat.locator('.assistant-turn')).toHaveCount(0);
  await chat.locator('.assistant-privacy summary').click();
  await expect(chat).toContainText('اسمك الأول وأسئلتك ومقتطفات من الردود');
  await composer.fill('نبدأ من جديد');
  await composer.press('Enter');
  await expect(chat.locator('.assistant-prose')).toContainText(
    'تمام، نبدأ من جديد.',
  );
  expect(requests[3]).toMatchObject({
    history: [],
    conversation: [],
    locale: 'ar',
  });
  await chat
    .getByRole('button', { name: 'إغلاق المساعد', exact: true })
    .click();
  await page.reload();
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  await expect(chat.locator('.assistant-turn')).toHaveCount(0);
});

test('assistant recognizes Gemini replies, refreshes capabilities and restores the composer after the conversation limit', async ({
  page,
}) => {
  test.setTimeout(90000);
  await register(page);
  let modeReads = 0;
  let degraded = false;
  await page.route('**/api/v1/assistant', async (route) => {
    if (route.request().method() === 'GET') {
      modeReads += 1;
      return route.fulfill({
        json: {
          success: true,
          data: { mode: modeReads === 1 ? 'guided' : 'gemini' },
        },
      });
    }
    return route.fulfill({
      json: {
        success: true,
        data: {
          plan: {
            intent: 'help',
            topic: 'invoices',
            status: 'open',
            query: '',
          },
          engine: degraded ? 'guided' : 'gemini',
          degraded,
          asOf: null,
          records: [],
          hasMore: false,
          facts: null,
        },
      },
    });
  });
  await page
    .getByRole('button', { name: 'افتح مساعد Lancelio', exact: true })
    .click();
  const chat = page.getByRole('dialog', {
    name: 'مساعد Lancelio',
    exact: true,
  });
  const composer = chat.getByLabel('سؤالك للمساعد', { exact: true });
  await expect(chat.locator('.assistant-mode')).toContainText(
    'الفهم الذكي لسه غير مفعّل',
  );
  for (let count = 1; count <= 20; count++) {
    await composer.fill(`اشرح الفاتورة ${count}`);
    await composer.press('Enter');
    await expect(
      chat.getByRole('link', { name: 'فتح فاتورة جديدة', exact: true }),
    ).toHaveCount(count);
  }
  await expect(chat.locator('.assistant-mode-text')).toHaveText('محادثة ذكية');
  await expect(composer).toBeDisabled();
  await expect(chat).toContainText('ابدأ محادثة جديدة علشان تكمل أسئلتك.');
  await chat.getByRole('button', { name: 'محادثة جديدة', exact: true }).click();
  await expect(composer).toBeEnabled();
  await expect(composer).toBeFocused();
  await expect(chat.locator('.assistant-mode-text')).toHaveText('محادثة ذكية');
  expect(modeReads).toBe(2);
  degraded = true;
  await composer.fill('إزاي أعمل فاتورة؟');
  await composer.press('Enter');
  await expect(chat.locator('.assistant-guided-note')).toContainText(
    'الفهم الذكي غير متاح حاليًا',
  );
  await expect(chat.locator('.assistant-mode-text')).toHaveText('محادثة ذكية');
});

test('assistant scroll responsive audit opens at the welcome and keeps the reader in control', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await register(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const longReply = Array.from(
    { length: 28 },
    (_, index) =>
      `Step ${index + 1}: Review the project scope, choose one clear priority, and leave time to check the result.`,
  ).join('\n\n');
  let releaseReply: (() => void) | undefined;
  await page.route('**/api/v1/assistant', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: { success: true, data: { mode: 'gemini' } },
      });
    if (route.request().postDataJSON().message === 'Continue the detailed plan')
      await new Promise<void>((resolve) => {
        releaseReply = resolve;
      });
    return route.fulfill({
      json: {
        success: true,
        data: {
          message: longReply,
          plan: {
            intent: 'chat',
            topic: 'navigation',
            status: 'open',
            query: '',
          },
          engine: 'gemini',
          degraded: false,
          asOf: null,
          records: [],
          hasMore: false,
          facts: null,
        },
      },
    });
  });
  const chat = page.locator('.assistant-dialog');
  const transcript = chat.locator('.assistant-transcript');
  const composer = chat.locator('#assistant-question');
  const open = () => page.locator('.assistant-launcher').click();
  const close = () =>
    chat
      .getByRole('button', { name: /^(?:إغلاق المساعد|Close assistant)$/u })
      .click();
  for (const locale of ['ar', 'en'] as const) {
    await context.addCookies([
      { name: 'lancelio_language', value: locale, url: testOrigin },
    ]);
    await page.reload();
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [390, 844],
      [320, 568],
    ] as const) {
      await page.setViewportSize({ width, height });
      await open();
      await expect(chat.locator('.assistant-mode-text')).toContainText(
        locale === 'ar' ? 'محادثة ذكية' : 'Intelligent conversation',
      );
      await expect(composer).toBeFocused();
      await expect
        .poll(() => transcript.evaluate((element) => element.scrollTop))
        .toBe(0);
      if (height >= 720)
        expect(
          await transcript.evaluate(
            (element) => element.scrollHeight - element.clientHeight,
          ),
        ).toBeLessThanOrEqual(1);
      await expect(chat.locator('.assistant-privacy')).not.toHaveAttribute(
        'open',
        '',
      );
      const observation = await inspectResponsiveLayout(
        page,
        `assistant-welcome-${locale}-${width}`,
        width <= 760,
        width,
      );
      expect(
        observation.issues,
        observation.issues.length
          ? JSON.stringify(
              await page.evaluate(() => ({
                inner: innerWidth,
                root: document.documentElement.clientWidth,
                scroll: document.documentElement.scrollWidth,
                dialog: document
                  .querySelector('.assistant-dialog')
                  ?.getBoundingClientRect()
                  .toJSON(),
                header: document
                  .querySelector('.assistant-header')
                  ?.getBoundingClientRect()
                  .toJSON(),
              })),
            )
          : undefined,
      ).toEqual([]);
      if (width === 390)
        await chat.screenshot({
          path: resolve(
            import.meta.dirname,
            `../../../.cache/ui/assistant/welcome-compact-${locale}.png`,
          ),
          animations: 'disabled',
        });
      const privacy = chat.locator('.assistant-privacy summary');
      await privacy.focus();
      await privacy.press('Enter');
      await expect(chat.locator('.assistant-privacy')).toHaveAttribute(
        'open',
        '',
      );
      await transcript.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await close();
      await open();
      await expect
        .poll(() => transcript.evaluate((element) => element.scrollTop))
        .toBe(0);
      await expect(chat.locator('.assistant-privacy')).not.toHaveAttribute(
        'open',
        '',
      );
      await close();
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await open();
  await composer.fill('Explain a detailed plan');
  await composer.press('Enter');
  await expect(chat.locator('.assistant-prose')).toContainText('Step 28:');
  await expect(chat.locator('.assistant-prose p').first()).toBeInViewport();
  await expect
    .poll(() => transcript.evaluate((element) => element.scrollTop))
    .toBe(0);
  await transcript.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() =>
      transcript.evaluate(
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
  await composer.fill('Continue the detailed plan');
  await composer.press('Enter');
  await expect(chat.locator('.assistant-pending')).toBeVisible();
  await transcript.evaluate((element) => {
    element.scrollTop = 180;
  });
  await expect(
    chat.getByRole('button', { name: 'Latest messages', exact: true }),
  ).toBeVisible();
  const readingPosition = await transcript.evaluate(
    (element) => element.scrollTop,
  );
  expect(releaseReply).toBeDefined();
  releaseReply?.();
  await expect(chat.locator('.assistant-prose')).toHaveCount(2);
  await expect
    .poll(() =>
      transcript.evaluate((element) => Math.abs(element.scrollTop - 180)),
    )
    .toBeLessThanOrEqual(1);
  await close();
  await open();
  await expect
    .poll(() => transcript.evaluate((element) => element.scrollTop))
    .toBe(readingPosition);
  await chat
    .getByRole('button', { name: 'Latest messages', exact: true })
    .click();
  await expect(transcript).toBeFocused();
  await expect
    .poll(() =>
      transcript.evaluate(
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
  await expect(
    chat.getByRole('button', { name: 'Latest messages', exact: true }),
  ).toHaveCount(0);
  await chat
    .getByRole('button', { name: 'New conversation', exact: true })
    .click();
  await expect(chat.locator('.assistant-welcome')).toBeVisible();
  await expect
    .poll(() => transcript.evaluate((element) => element.scrollTop))
    .toBe(0);
});

test('assistant responsive audit fits both languages and themes on desktop and short mobile screens', async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  await register(page);
  for (const locale of ['ar', 'en'] as const) {
    await context.addCookies([
      { name: 'lancelio_language', value: locale, url: testOrigin },
    ]);
    await page.reload();
    const english = locale === 'en';
    for (const [width, height] of [
      [1440, 900],
      [768, 1024],
      [390, 844],
      [320, 568],
      [320, 256],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const mode of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
        await page
          .getByRole('button', {
            name: english ? 'Open Lancelio assistant' : 'افتح مساعد Lancelio',
            exact: true,
          })
          .click();
        const chat = page.getByRole('dialog', {
          name: english ? 'Lancelio assistant' : 'مساعد Lancelio',
          exact: true,
        });
        await expect(chat).toBeVisible();
        await chat
          .getByRole('button', {
            name: english ? 'New conversation' : 'محادثة جديدة',
            exact: true,
          })
          .click();
        await expect(
          chat.getByRole('button', {
            name: english ? 'How do I create an invoice?' : 'إزاي أعمل فاتورة؟',
            exact: true,
          }),
        ).toBeEnabled();
        expect(
          (
            await inspectResponsiveLayout(
              page,
              'assistant-empty-' + locale + mode,
              width <= 760,
              width,
            )
          ).issues,
        ).toEqual([]);
        await chat
          .getByRole('button', {
            name: english ? 'How do I create an invoice?' : 'إزاي أعمل فاتورة؟',
            exact: true,
          })
          .click();
        await expect(
          chat.getByRole('link', {
            name: english ? 'Open a new invoice' : 'فتح فاتورة جديدة',
            exact: true,
          }),
        ).toBeVisible();
        expect(
          (
            await inspectResponsiveLayout(
              page,
              'assistant-answer-' + locale + mode,
              width <= 760,
              width,
            )
          ).issues,
        ).toEqual([]);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await chat.screenshot({
          path: resolve(
            import.meta.dirname,
            `../../../.cache/ui/assistant/${locale}-${mode}-${width}-${height}.png`,
          ),
          animations: 'disabled',
        });
        await page.keyboard.press('Escape');
      }
    }
  }
});

test.describe('language support', () => {
  test.use({ locale: 'en-US' });

  test('language defaults are rendered on the server and manual choices override device preferences', async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    const html = await (
      await page.request.get('/login', {
        headers: { 'Accept-Language': 'en-US' },
      })
    ).text();
    expect(html).toMatch(/<html[^>]*lang="en"[^>]*dir="ltr"/u);
    expect(html).toContain('Welcome back');
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Site language', exact: true }),
    ).toHaveAttribute('value', 'en');
    await page
      .getByRole('combobox', { name: 'Site language', exact: true })
      .click();
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
      'العربية',
      'English',
    ]);
    await page
      .getByRole('combobox', { name: 'Site language', exact: true })
      .press('Escape');
    await expect(page.locator('.language-select')).not.toHaveAttribute(
      'title',
      /device/i,
    );
    expect(
      (await context.cookies()).find(
        (cookie) => cookie.name === 'lancelio_language',
      ),
    ).toBeUndefined();
    await selectOption(
      page.getByRole('combobox', { name: 'Site language', exact: true }),
      'en',
    );
    expect(
      (await context.cookies()).find(
        (cookie) => cookie.name === 'lancelio_language',
      )?.value,
    ).toBe('en');
    await page
      .getByRole('button', { name: 'Sign in to your workspace', exact: true })
      .click();
    await expect(
      page.getByText('Enter a valid email address.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Email address', exact: true })
      .fill('draft@example.com');
    await selectOption(
      page.getByRole('combobox', { name: 'Site language', exact: true }),
      'ar',
    );
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByRole('textbox', { name: 'البريد الإلكتروني', exact: true }),
    ).toHaveValue('draft@example.com');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await context.clearCookies({ name: 'lancelio_language' });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.addCookies([
      { name: 'lancelio_language', value: 'invalid', url: testOrigin },
    ]);
    for (const [header, expected] of [
      ['fr-FR,en-GB;q=0.8,ar;q=0.5', 'en'],
      ['fr-FR,ar-EG;q=0.8,en;q=0.5', 'ar'],
      ['fr,de', 'ar'],
    ] as const) {
      const response = await page.request.get('/login', {
        headers: { 'Accept-Language': header },
      });
      expect(await response.text()).toMatch(
        new RegExp(`<html[^>]*lang="${expected}"`, 'u'),
      );
    }
    const resetToken = 'a'.repeat(43);
    await page.goto('/reset-password#token=' + resetToken);
    await page
      .getByLabel('New password', { exact: true })
      .fill('Language keeps this draft safe 123!');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('Language keeps this draft safe 123!');
    await expect(page).toHaveURL('/reset-password');
    await selectOption(
      page.getByRole('combobox', { name: 'Site language', exact: true }),
      'ar',
    );
    await expect(
      page.getByLabel('كلمة المرور الجديدة', { exact: true }),
    ).toHaveValue('Language keeps this draft safe 123!');
    await selectOption(
      page.getByRole('combobox', { name: 'لغة الموقع', exact: true }),
      'en',
    );
    let submittedToken: unknown;
    await page.route('**/api/v1/auth/reset-password', async (route) => {
      submittedToken = (route.request().postDataJSON() as { token: unknown })
        .token;
      await route.fulfill({
        status: 400,
        json: { success: false, error: { code: 'RECOVERY_INVALID' } },
      });
    });
    await page
      .getByRole('button', { name: 'Save password', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Link unavailable', exact: true }),
    ).toBeVisible();
    expect(submittedToken).toBe(resetToken);
  });

  test('language switch preserves draft input and current URLs while keeping user content unchanged', async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await context.addCookies([
      { name: 'lancelio_language', value: 'ar', url: testOrigin },
    ]);
    const { scope, clientId } = await seedOverview(page);
    await page.goto('/proposals/new?from=language#draft');
    await page.getByLabel('عنوان العرض', { exact: true }).fill('العملاء');
    await selectOption(
      page.locator('.sidebar-language').getByRole('combobox'),
      'en',
    );
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page).toHaveURL('/proposals/new?from=language#draft');
    await expect(
      page.getByLabel('Proposal title', { exact: true }),
    ).toHaveValue('العملاء');
    await page
      .getByLabel('Item description 1', { exact: true })
      .fill('عمل عربي محفوظ');
    await page.getByLabel('Unit price 1', { exact: true }).fill('10.25');
    await expect(page.locator('.proposal-preview-total')).toContainText(
      '10.25',
    );
    await selectOption(
      page.locator('.sidebar-language').getByRole('combobox'),
      'ar',
    );
    await expect(page.getByLabel('عنوان العرض', { exact: true })).toHaveValue(
      'العملاء',
    );
    await expect(page.getByLabel('وصف البند 1', { exact: true })).toHaveValue(
      'عمل عربي محفوظ',
    );
    expect(await proposalModel.countDocuments({ workspace: scope })).toBe(1);
    expect((await clients.read(scope, clientId)).name).toBe(
      'عميل دفتر المتابعة',
    );
  });

  test('language English covers real workspace views, errors and shared documents without translating client data', async ({
    page,
    context,
  }) => {
    test.setTimeout(240000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await context.addCookies([
      { name: 'lancelio_language', value: 'ar', url: testOrigin },
    ]);
    const { scope, clientId, first } = await seedOverview(page);
    await seedOverviewTasks(scope, clientId);
    const project = await projectModel.findOne({ workspace: scope }).orFail();
    const proposal = await proposalModel.findOne({ workspace: scope }).orFail();
    await page.goto('/settings/language');
    await selectOption(
      page.locator('.profile-sheet').getByRole('combobox'),
      'en',
    );
    await expect(page).toHaveTitle('Language and region | Lancelio');
    const untranslated: { path: string; text: string[] }[] = [];
    const accessibility: unknown[] = [];
    const allowed =
      /أحمد علي|استوديو أحمد|عميل دفتر المتابعة|مشروع توزيع المهام|مهمة واضحة|مستحقات شغل|شغل/gu;
    for (const path of [
      '/dashboard',
      '/clients',
      '/projects',
      '/proposals',
      '/invoices',
      '/notifications',
      '/settings',
      '/settings/security',
      '/settings/workspace',
      '/settings/appearance',
      '/settings/language',
      '/proposals/new',
      '/projects/new',
      '/invoices/new',
      '/projects/' + project.id,
      '/proposals/' + proposal.id,
      '/invoices/' + first,
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('.loading-placeholder')).toHaveCount(0);
      const text = await page.locator('body').innerText();
      const leftover = text
        .replace(allowed, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(
          (line) =>
            /[\u0600-\u06ff]/u.test(line) &&
            !['العربية', 'ا', 'أ', 'ع'].includes(line),
        );
      if (leftover.length) untranslated.push({ path, text: leftover });
      const audit = await new AxeBuilder({ page }).analyze();
      accessibility.push(
        ...audit.violations.map((violation) => ({
          path,
          rule: violation.id,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            detail: node.failureSummary,
          })),
        })),
      );
    }
    expect(untranslated).toEqual([]);
    expect(accessibility).toEqual([]);
    await page.goto('/clients?client=' + clientId);
    await expect(page.getByLabel('Client name', { exact: true })).toHaveValue(
      'عميل دفتر المتابعة',
    );
    await page
      .getByRole('button', { name: 'Close window', exact: true })
      .click();
    await page.goto('/settings');
    await page.route('**/api/v1/settings/profile', (route) =>
      route.fulfill({
        status: 503,
        json: { success: false, error: { code: 'SERVER_ERROR' } },
      }),
    );
    await page.reload();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'temporarily unavailable',
    );
    await page.unroute('**/api/v1/settings/profile');
    const invoice = await invoiceModels.Invoice.findById(first).orFail();
    const invoiceGrant = await createInvoiceSharing(
      invoiceModels,
      () => shareNow,
    ).issue(scope, first, invoice.version, 1);
    const proposalGrant = await createProposalSharing(
      proposalModel,
      () => shareNow,
    ).issue(scope, account.workspaceName, proposal.id, proposal.version, 1);
    const portal = createPortal(
      database,
      portalModel,
      {
        clients: clientModel.collection.name,
        workspaces: models.Workspace.collection.name,
        projects: projectModel.collection.name,
        tasks: taskBoardModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
        payments: paymentModel.collection.name,
      },
      () => shareNow,
    );
    const portalState = await portal.read(scope, clientId);
    const portalGrant = await portal.issue(
      scope,
      clientId,
      portalState.version,
      1,
    );
    for (const [kind, token] of [
      ['invoice', invoiceGrant.token],
      ['proposal', proposalGrant.token],
      ['portal', portalGrant.token],
    ] as const) {
      await page.goto(`/share/${kind}#${token}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        kind === 'invoice'
          ? 'مستحقات شغل'
          : kind === 'portal'
            ? 'عميل دفتر المتابعة'
            : proposal.title,
      );
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      expect(new URL(page.url()).hash).toBe('#' + token);
      const text = (await page.locator('body').innerText())
        .replace(allowed, '')
        .replaceAll('شغل', '')
        .replaceAll('العربية', '');
      expect(text.match(/[\u0600-\u06ff]+/gu), kind).toBeNull();
      expect(
        (await new AxeBuilder({ page }).analyze()).violations,
        kind,
      ).toEqual([]);
      await selectOption(
        page.getByRole('combobox', { name: 'Site language', exact: true }),
        'ar',
      );
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      expect(new URL(page.url()).hash).toBe('#' + token);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await selectOption(
        page.getByRole('combobox', { name: 'لغة الموقع', exact: true }),
        'en',
      );
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await page.setViewportSize({ width: 320, height: 568 });
      expect(
        (
          await inspectResponsiveLayout(
            page,
            'english-public-' + kind,
            false,
            320,
          )
        ).issues,
      ).toEqual([]);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });

  test('language responsive audit keeps LTR forms and navigation usable in both themes', async ({
    page,
    context,
  }) => {
    test.setTimeout(180000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await context.addCookies([
      { name: 'lancelio_language', value: 'ar', url: testOrigin },
    ]);
    await seedOverview(page);
    await page.goto('/settings/language');
    await selectOption(
      page.locator('.profile-sheet').getByRole('combobox'),
      'en',
    );
    for (const [width, height] of [
      [1440, 900],
      [768, 1024],
      [390, 844],
      [320, 568],
      [320, 256],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const mode of ['dark', 'light'] as const) {
        await page.goto('/settings/appearance');
        await page
          .getByRole('radio', { name: mode === 'dark' ? /^Dark/ : /^Light/ })
          .check();
        expect(
          (
            await inspectResponsiveLayout(
              page,
              'english-' + mode,
              width <= 760,
              width,
            )
          ).issues,
        ).toEqual([]);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        await page
          .getByRole('button', { name: 'Search workspace', exact: true })
          .click();
        const search = page.getByRole('dialog', {
          name: 'Search workspace',
          exact: true,
        });
        await search.getByRole('searchbox').fill('عميل دفتر');
        await expect(search.locator('.workspace-search-group')).toHaveCount(3);
        expect(
          (
            await inspectResponsiveLayout(
              page,
              'english-search',
              width <= 760,
              width,
            )
          ).issues,
        ).toEqual([]);
        await page.keyboard.press('Escape');
        await page.goto('/dashboard');
        await expect(page.locator('.overview-counts')).toBeVisible();
        await page.screenshot({
          path: resolve(
            import.meta.dirname,
            `../../../.cache/ui/language/en-${mode}-${width}-${height}.png`,
          ),
          fullPage: true,
          animations: 'disabled',
        });
      }
      if (width <= 760) {
        await page
          .getByRole('button', { name: 'Open menu', exact: true })
          .click();
        const menu = page.getByRole('dialog', {
          name: 'Workspace menu',
          exact: true,
        });
        await expect(menu).toBeVisible();
        const bounds = await menu.boundingBox();
        expect(bounds!.x).toBe(0);
        expect(
          (await inspectResponsiveLayout(page, 'english-sidebar', true, width))
            .issues,
        ).toEqual([]);
        await page.keyboard.press('Escape');
      }
    }
  });
});
