// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  workers: 1, // serial — one browser at a time against the dev server

  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Auto-start Vite dev server before tests, shut it down after
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,  // skip re-launch if already running
    timeout: 30000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/report', open: 'never' }],
  ],
});
