import { defineConfig, devices } from '@playwright/test';

/**
 * Expo Web smokes. Point at staging with PLAYWRIGHT_BASE_URL + E2E_* creds, or run locally
 * (starts dev server unless PLAYWRIGHT_SKIP_WEBSERVER=1).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8081';

const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: skipWebServer
    ? undefined
    : {
        command: 'npx expo start --web',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { ...process.env, CI: '1' },
      },
});
