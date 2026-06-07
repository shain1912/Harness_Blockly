// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Port is overridable so tests can run on a machine where :3000 is taken by another
// project. Default stays 3000. With a custom PORT we also disable server reuse so we
// never accidentally bind to a foreign app already on the port.
const PORT = Number(process.env.PORT) || 3000;
const CUSTOM_PORT = !!process.env.PORT;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  workers: 1, // serial — one browser at a time against the dev server

  use: {
    baseURL: `http://localhost:${PORT}`,
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
    url: `http://localhost:${PORT}`,
    // Reuse only on the default port; on a custom PORT always start our own server so we
    // can't bind to a foreign app squatting the port.
    reuseExistingServer: !CUSTOM_PORT,
    timeout: 30000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/report', open: 'never' }],
  ],
});
