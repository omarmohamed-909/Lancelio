import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function respondToAppConfirmation(
  page: Page,
  respond: (dialog: {
    message: () => string;
    accept: () => Promise<void>;
    dismiss: () => Promise<void>;
  }) => void | Promise<void>,
) {
  const dialog = page.getByRole('dialog', {
    name: 'نكمّل الخطوة دي؟',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const message = await dialog.locator('#confirmation-message').innerText();
  const answer = async (accept: boolean) => {
    await dialog
      .getByRole('button', { name: accept ? 'تأكيد' : 'رجوع', exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  };
  await respond({
    message: () => message,
    accept: () => answer(true),
    dismiss: () => answer(false),
  });
}
