// VERIFICATION: the "실제 실행 (Shell)" path runs REAL local Python (real cv2) and streams
// output. Requires the Express backend (npm run server); skips cleanly if it isn't up so
// the Vite-only test runs don't fail.
const { test, expect } = require('@playwright/test');

test.describe.configure({ retries: 2 });

async function backendUp(page) {
  return page.evaluate(async () => {
    try { const r = await fetch('/api/health'); return r.ok; } catch (_) { return false; }
  });
}

test('Shell run streams real Python + cv2 output', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  test.skip(!(await backendUp(page)), 'backend (npm run server) not running');

  await page.locator('#tab-btn-python').click();
  await page.locator('#python-code').fill(
    'import cv2, numpy as np\nprint("cv2", cv2.__version__)\n' +
    'g = cv2.cvtColor(np.zeros((40,50,3), np.uint8), cv2.COLOR_BGR2GRAY)\n' +
    'print("gray", g.shape)\nprint("OK_CV2_SHELL")'
  );
  await page.waitForTimeout(500);
  await page.locator('#btn-run-shell').click();
  // Wait for the run to finish (the backend appends an [exit N] marker), then assert.
  await page.waitForFunction(
    () => /\[exit /.test(document.querySelector('#console-logs')?.textContent || ''),
    { timeout: 45000 }
  );
  const logs = (await page.locator('#console-logs').textContent()) || '';
  expect(logs).toContain('OK_CV2_SHELL');
  expect(logs).toMatch(/cv2 4\./);         // the REAL local opencv version
  expect(logs).toContain('gray (40, 50)'); // real cvtColor reduced 3 channels -> 1
});

test('real pip install runs and reports a result', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  test.skip(!(await backendUp(page)), 'backend (npm run server) not running');
  // pip is the standard library's package manager — always present; "pip" alone errors
  // usefully, but installing a tiny already-present spec returns fast with a clear result.
  await page.locator('.pip-input').fill('cowsay');
  await page.locator('.pip-form button[type=submit]').click();
  await page.waitForFunction(
    () => /\[pip exit /.test(document.querySelector('#console-logs')?.textContent || ''),
    { timeout: 45000 }
  );
  const logs = (await page.locator('#console-logs').textContent()) || '';
  expect(/Successfully installed|already satisfied/.test(logs)).toBe(true);
});
