import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { welcomeTemplate } from '../apps/api/src/modules/auth/infrastructure/welcome-template.js';

let browser: Browser;
before(async () => {
  await mkdir('.cache/welcome-rtl-check', { recursive: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

for (const kind of ['signup', 'existing'] as const) {
  for (const language of ['ar', 'en'] as const) {
    for (const width of [390, 720]) {
      test(`${kind} ${language} at ${width}px preserves email layout after html/body removal`, async () => {
        const page = await browser.newPage({
          viewport: { width, height: 1100 },
        });
        try {
          const content = welcomeTemplate(
            {
              name: 'Omar عمر',
              email: 'fixture@example.com',
              workspaceName: 'Nawa استوديو',
              language,
              kind,
            },
            'https://www.lancelio.tech',
          );
          await page.setContent(content.html);
          const fragment = await page.locator('body').innerHTML();
          const opposite = language === 'ar' ? 'ltr' : 'rtl';
          await page.setContent(
            `<!doctype html><html dir="${opposite}"><body style="margin:0;font-family:'Times New Roman';direction:${opposite};text-align:${opposite === 'ltr' ? 'left' : 'right'}"><main>${fragment}</main></body></html>`,
          );
          const blocks = await page
            .locator('main h1, main p')
            .evaluateAll((nodes) =>
              nodes.map((node) => {
                const css = getComputedStyle(node);
                return {
                  direction: css.direction,
                  alignment: css.textAlign,
                  font: css.fontFamily,
                };
              }),
            );
          assert.ok(blocks.length >= 7);
          for (const block of blocks) {
            assert.equal(block.direction, language === 'ar' ? 'rtl' : 'ltr');
            assert.equal(block.alignment, language === 'ar' ? 'right' : 'left');
            assert.match(block.font, /Tahoma/u);
          }
          const number = await page
            .locator('td[width="42"]')
            .first()
            .boundingBox();
          const step = await page
            .locator('td[width="42"] + td')
            .first()
            .boundingBox();
          assert.ok(number && step);
          assert.equal(number.x > step.x, language === 'ar');
          assert.equal(await page.locator('span[dir="auto"]').count(), 2);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          assert.equal(
            await page
              .locator('a[href="https://www.lancelio.tech/dashboard"]')
              .isVisible(),
            true,
          );
          await page.evaluate(
            () =>
              new Promise<void>((resolve) => {
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                );
              }),
          );
          await page.screenshot({
            path: `.cache/welcome-rtl-check/${kind}-${language}-${width}.png`,
            fullPage: true,
          });
        } finally {
          await page.close();
        }
      });
    }
  }
}
