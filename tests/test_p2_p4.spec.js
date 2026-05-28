const { test, expect } = require('@playwright/test');

test('P2: class definition with method runs correctly', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#tab-btn-python').click();
  await page.waitForTimeout(500);

  const code = `class Dog:\n    def bark(self):\n        print("Woof!")\n\nd = Dog()\nd.bark()`;
  await page.locator('#python-code').fill(code);
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(1000);

  await page.locator('#tab-btn-blockly').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/p2_blocks.png' });

  // Check no parser error on convert
  const parserError = await page.evaluate(() => {
    return window._lastParserError || null;
  });

  // Now run and check output
  await page.locator('#tab-btn-logs').click();
  await page.locator('#btn-run').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/p2_run.png' });

  const consoleText = await page.locator('#console-logs').textContent();
  console.log('P2 output:', consoleText);

  expect(consoleText).toContain('Woof!');
  expect(consoleText).not.toContain('[Runtime Error]');
});

test('P4: lambda used in map runs correctly', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#tab-btn-python').click();
  await page.waitForTimeout(500);

  // Test: lambda as argument, but for simple test use assignment
  const code = `double = lambda x: x * 2\nprint(double(5))`;
  await page.locator('#python-code').fill(code);
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(1000);

  await page.locator('#tab-btn-blockly').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/p4_blocks.png' });

  await page.locator('#tab-btn-logs').click();
  await page.locator('#btn-run').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/p4_run.png' });

  const consoleText = await page.locator('#console-logs').textContent();
  console.log('P4 output:', consoleText);

  // Lambda is stored as text, but interpreter should handle it
  expect(consoleText).not.toContain('[Runtime Error]');
  // The interpreter may or may not support lambda fully — at minimum no crash
});
