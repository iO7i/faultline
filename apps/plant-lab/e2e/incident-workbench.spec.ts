import { expect, test } from '@playwright/test';

test('compares the native P-101 authority race, exports it, and restores it', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('faultline-result')).toHaveText('READY');
  await page.getByTestId('revision-timing').selectOption('after-approval-before-effect');
  await page.getByTestId('run-experiment').click();
  await expect(page.locator('#approval-only-result')).toHaveText('I3 VIOLATION');
  await expect(page.locator('#approval-only-detail')).toContainText('P-101 0.70');
  await expect(page.locator('#guarded-result')).toHaveText('STALE 0.70 REJECTED');
  await page.getByTestId('compare-policies').click();
  await expect(page.locator('.compare-scene')).toHaveCount(2);
  await page.getByTestId('approve-revised').click();
  await expect(page.locator('#guarded-result')).toHaveText('PASS');
  await expect(page.locator('#guarded-detail')).toContainText('P-101 0.50');
  await page.getByRole('button', { name: 'JUMP TO FIRST VIOLATION' }).click();
  await expect(page.locator('#incident-evidence')).toContainText('R17');
  await expect(page.locator('#incident-evidence')).toContainText('R18');
  await expect(page.locator('#incident-evidence')).toContainText('I3_STALE_AUTHORITY_CANNOT_COMMIT');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT INCIDENT' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream ?? []) chunks.push(Buffer.from(chunk));
  const capsule = Buffer.concat(chunks);
  await page.reload();
  await expect(page.getByTestId('faultline-result')).toHaveText('READY');
  await page
    .locator('#incident-file')
    .setInputFiles({ name: 'incident.json', mimeType: 'application/json', buffer: capsule });
  await expect(page.locator('#approval-only-result')).toHaveText('I3 VIOLATION');
  await expect(page.locator('#guarded-result')).toHaveText('PASS');
  expect(errors).toEqual([]);
});

test('keeps before-approval and after-valid-effect free of a retroactive I3', async ({ page }) => {
  await page.goto('/');
  for (const timing of ['before-approval', 'after-valid-effect']) {
    await page.getByTestId('revision-timing').selectOption(timing);
    await page.getByTestId('run-experiment').click();
    await expect(page.locator('#approval-only-result')).toHaveText('PASS');
    await expect(page.locator('#guarded-result')).toHaveText('PASS');
  }
});
