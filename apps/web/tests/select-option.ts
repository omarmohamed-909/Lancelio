import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

/** Exercise the visible picker rather than changing a hidden control. */
export async function selectOption(control: Locator, value: string) {
  await control.click();
  const id = await control.getAttribute('aria-controls');
  const triggerId = await control.getAttribute('id');
  if (!id) throw new Error('Select does not expose its listbox');
  const popup = control.page().locator(`[id=${JSON.stringify(id)}]`);
  await expect(popup).toBeVisible();
  await popup
    .locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
    .click();
  const stableControl = control
    .page()
    .locator(`[id=${JSON.stringify(triggerId)}]`);
  await expect(stableControl).toHaveAttribute('value', value);
  await expect(stableControl).toHaveAttribute('aria-expanded', 'false');
}
