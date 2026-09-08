import { expect, test } from '@playwright/test';

test('runs the public AEL scenarios and minimized witness in the browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#plant-canvas')).toBeVisible();
  await expect(page.getByTestId('faultline-result')).toHaveText('READY');

  await page.getByRole('button', { name: 'RUN SAFE' }).click();
  await expect(page.getByTestId('faultline-result')).toHaveText('PASS');

  await page.getByRole('button', { name: 'STALE AUTHORITY' }).click();
  await expect(page.getByTestId('faultline-result')).toHaveText('VIOLATION • I3');
  await expect(page.locator('#equipment-id')).toHaveText('P-101');

  await page.getByRole('button', { name: 'REPLAY COUNTEREXAMPLE' }).click();
  await expect(page.locator('#scenario-status')).toContainText('Minimized witness replay');
  await expect(page.getByTestId('faultline-result')).toHaveText('VIOLATION • I3');
  await expect(page.getByTestId('timeline')).toContainText('I3 stale authority');
  expect(errors).toEqual([]);
});
