const { test, expect, chromium } = require('@playwright/test');

test('P0: list comprehension converts to real blocks (never a lossy text block) in both desugar modes', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

  // Switch to Python tab
  await page.locator('#tab-btn-python').click();
  await page.waitForTimeout(500);

  const toggle = page.locator('#toggle-desugar');
  const getBlocks = () => page.evaluate(() => {
    const ws = window.Blockly?.getMainWorkspace();
    if (!ws) return [];
    return ws.getAllBlocks().map(b => ({ type: b.type, text: b.type === 'text' ? b.getFieldValue('TEXT') : null }));
  });

  // --- Desugar ON: list comp unrolls into a real loop ---
  if (!(await toggle.isChecked())) await toggle.check();
  await page.locator('#python-code').fill('numbers = [1, 2, 3]\ny = [x*2 for x in numbers]\nprint(y)');
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(1000);

  let blockTypes = await getBlocks();
  console.log('Desugar ON:', blockTypes.map(b => b.type).join(', '));
  // Never a lossy `text` block holding the raw comprehension source
  expect(blockTypes.some(b => b.text && b.text.includes('for x in'))).toBe(false);
  expect(blockTypes.some(b => b.type.includes('repeat') || b.type.includes('for') || b.type.includes('forEach'))).toBe(true);

  // --- Desugar OFF: list comp keeps its dedicated block ---
  await toggle.uncheck();
  // distinct snippet avoids the snapshot-recovery shortcut in syncCodeToBlocks
  await page.locator('#python-code').fill('nums = [4, 5, 6]\nz = [x*3 for x in nums]\nprint(z)');
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(1000);

  blockTypes = await getBlocks();
  console.log('Desugar OFF:', blockTypes.map(b => b.type).join(', '));
  expect(blockTypes.some(b => b.text && b.text.includes('for x in'))).toBe(false);
  expect(blockTypes.some(b => b.type === 'list_comprehension')).toBe(true);
});

test('P1: def/return works - square function prints 25', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  
  await page.locator('#tab-btn-python').click();
  await page.waitForTimeout(500);
  
  await page.locator('#python-code').fill('def square(x):\n    return x * x\n\nprint(square(5))');
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(1000);
  
  await page.locator('#tab-btn-blockly').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/p1_blocks.png' });
  
  // Run and check output
  await page.locator('#tab-btn-logs').click();
  await page.locator('#btn-run').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/p1_run.png' });
  
  const consoleText = await page.locator('#console-logs').textContent();
  console.log('Console output:', consoleText);
  
  expect(consoleText).toContain('25');
  expect(consoleText).not.toContain('[Parser Error]');
  expect(consoleText).not.toContain('[Runtime Error]');
});
