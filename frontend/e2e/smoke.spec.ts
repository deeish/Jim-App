import { test, expect } from '@playwright/test';

const email = process.env.E2E_STAGING_EMAIL ?? '';
const password = process.env.E2E_STAGING_PASSWORD ?? '';

test.describe('staging smoke (Expo Web)', () => {
  test('sign in → plan tab → workout tab → optional save heart', async ({ page }) => {
    test.skip(
      !email || !password,
      'Set E2E_STAGING_EMAIL and E2E_STAGING_PASSWORD (staging test account).',
    );

    await page.goto('/');

    await page.getByTestId('e2e-login-email').fill(email);
    await page.getByTestId('e2e-login-password').fill(password);
    await page.getByTestId('e2e-login-submit').click();

    await expect(page.getByTestId('e2e-home-root')).toBeVisible({ timeout: 45_000 });

    await page.getByTestId('e2e-tab-plan').click();
    await expect(page.getByTestId('e2e-plan-root')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('e2e-tab-workout').click();
    await expect(page.getByTestId('e2e-workout-root')).toBeVisible({ timeout: 30_000 });

    const heart = page.getByTestId('e2e-workout-save-heart');
    if ((await heart.count()) > 0) {
      const enabled = await heart.isEnabled().catch(() => false);
      if (enabled) {
        await heart.click();
      }
    }
  });
});
