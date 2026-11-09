import { expect, test } from '@playwright/test';

test('page title', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Methane Ledger');
});
