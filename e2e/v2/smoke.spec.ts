import { expect, test } from '@playwright/test';

test('v2 home loads and shows the H1', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('h1')).toBeVisible();
});
