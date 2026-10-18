import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Notification } from '../src/features/notifications/schemas/notifications';

function notification(id: string, occurredAt: string): Notification {
  return {
    id,
    kind: 'invoice_issued',
    title: id,
    occurredAt,
    target: { type: 'invoice', id: '123456789012345678901234' },
    read: false,
    readAt: null,
    version: 0,
  };
}

async function prepare(page: Page, blockAudio = false) {
  const identity = {
    user: { id: 'user', name: 'أحمد', email: 'ahmed@example.com' },
    workspace: { id: 'workspace', name: 'مساحة العمل', slug: 'workspace' },
    membership: { id: 'membership', role: 'owner' },
  };
  const state = {
    items: [notification('old', '2026-10-10T08:00:00.000Z')],
    fail: false,
    reads: 0,
  };
  await page.clock.install();
  await page.addInitScript((blocked) => {
    const audioWindow = window as typeof window & { notificationTones: number };
    audioWindow.notificationTones = 0;
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = class extends OriginalAudioContext {
      constructor() {
        if (blocked) throw new Error('Audio unavailable');
        super();
      }
      override createOscillator() {
        const oscillator = super.createOscillator();
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (when) => {
          audioWindow.notificationTones++;
          start(when);
        };
        return oscillator;
      }
    };
  }, blockAudio);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith('/auth/refresh'))
      data = {
        ...identity,
        accessToken: 'test',
        expiresIn: 3600,
        tokenType: 'Bearer',
      };
    else if (path.endsWith('/auth/me')) data = identity;
    else if (path.endsWith('/notifications/summary'))
      data = {
        unreadCount: state.items.filter((item) => !item.read).length,
        asOf: new Date().toISOString(),
      };
    else if (path.endsWith('/read')) {
      const item = state.items.find((item) =>
        path.includes('/' + item.id + '/'),
      )!;
      item.read = (route.request().postDataJSON() as { read: boolean }).read;
      item.readAt = item.read ? new Date().toISOString() : null;
      item.version++;
      data = item;
    } else if (path.endsWith('/notifications')) {
      state.reads++;
      if (state.fail) {
        await route.abort();
        return;
      }
      data = {
        items: state.items,
        unreadCount: state.items.filter((item) => !item.read).length,
        nextCursor: null,
        asOf: new Date().toISOString(),
      };
    } else {
      await route.abort();
      return;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/notifications');
  await expect(page.locator('.notification-row')).toHaveCount(1);
  await expect.poll(() => state.reads).toBeGreaterThanOrEqual(2);
  return state;
}

async function tones(page: Page) {
  return page.evaluate(
    () =>
      (window as typeof window & { notificationTones: number })
        .notificationTones,
  );
}

test('notification sound plays once for new events and stays silent for old events and read changes', async ({
  page,
}) => {
  const state = await prepare(page);
  expect(await tones(page)).toBe(0);
  await page.getByRole('button', { name: 'علّم كمقروء' }).click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
  await page.getByRole('button', { name: 'اعتبره غير مقروء' }).click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(0);
  expect(await tones(page)).toBe(0);

  state.items.unshift(notification('new', '2026-10-10T08:01:00.000Z'));
  await page.clock.fastForward(15_100);
  await expect(page.locator('.notification-badge')).toHaveText('٢');
  await expect.poll(() => tones(page)).toBe(2);
  await page.clock.fastForward(15_100);
  expect(await tones(page)).toBe(2);

  // A new event still sounds when another event is read and the count is unchanged.
  state.items[0]!.read = true;
  state.items.unshift(notification('same-time', '2026-10-10T08:01:00.000Z'));
  await page.clock.fastForward(15_100);
  await expect.poll(() => tones(page)).toBe(4);
  await page.getByRole('button', { name: 'قراءة الإشعارات من جديد' }).click();
  await expect(page.locator('.notification-row')).toHaveCount(3);
  expect(await tones(page)).toBe(4);

  await page.clock.fastForward(15_100);
  expect(await tones(page)).toBe(4);
});

test('notification polling recovers after network failure when audio is unavailable', async ({
  page,
}) => {
  const state = await prepare(page, true);
  await page.getByRole('button', { name: 'علّم كمقروء' }).click();
  await expect(page.locator('.notification-row.is-read')).toHaveCount(1);
  state.fail = true;
  const reads = state.reads;
  state.items.unshift(notification('new', '2026-10-10T08:01:00.000Z'));
  await page.clock.fastForward(15_100);
  await expect.poll(() => state.reads).toBeGreaterThan(reads);
  await expect(page.locator('.notification-link')).toHaveAttribute(
    'aria-label',
    'افتح الإشعارات، ٠ غير مقروء',
  );
  state.fail = false;
  await page.clock.fastForward(15_100);
  await expect(page.locator('.notification-badge')).toHaveText('١');
  expect(await tones(page)).toBe(0);
});
