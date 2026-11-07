import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 15000,
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -w @marketpilot/api',
      env: { PORT: '4000', HOST: '127.0.0.1' },
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'npm run dev -w @marketpilot/web',
      env: { PORT: '3000' },
      url: 'http://localhost:3000/demo',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
