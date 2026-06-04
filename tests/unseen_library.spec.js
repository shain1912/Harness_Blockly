// Proves an UNSEEN library (no BlockPy preset) auto-converts to dynamic blocks on
// Convert and runs after micropip install — the "pip -> convert -> run" promise.
const { test, expect } = require('@playwright/test');

test('unseen library (humanize): Convert auto-creates dynamic blocks, runs losslessly', async ({ page }) => {
  test.setTimeout(120000);
  const code = 'import humanize\nprint(humanize.intcomma(1234567))\nprint(humanize.ordinal(21))\nprint(humanize.naturalsize(1048576))';

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#tab-btn-python').click();
  await page.locator('#python-code').fill(code);
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(1200);

  // Auto-registered dynamic blocks present; lib calls are NOT lossy raw_statements.
  const types = await page.evaluate(() =>
    window.Blockly.getMainWorkspace().getAllBlocks().map((b) => b.type));
  expect(types).toContain('lib_humanize_intcomma');
  expect(types).toContain('lib_humanize_ordinal');
  expect(types).toContain('lib_humanize_naturalsize');

  // Run: micropip installs humanize, prints the three lines.
  await page.locator('#tab-btn-logs').click();
  await page.locator('#btn-run').click();
  await page.waitForFunction(() => {
    const t = document.querySelector('#console-logs')?.textContent || '';
    return t.includes('Execution completed') || t.includes('Error');
  }, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(800);

  const logs = await page.locator('#console-logs').textContent();
  expect(logs).not.toContain('[Parser Error]');
  expect(logs).not.toContain('[Runtime Error]');
  expect(logs).toContain('1,234,567');
  expect(logs).toContain('21st');
  expect(logs).toContain('1.0 MB');
});
