// W1 verification: "Exceptions & context managers" Blockly blocks.
// Block types under test: try_statement, raise_statement, assert_statement, with_statement.
// For each: verify (1) the block RENDERS when Python -> blocks, and (2) where feasible
// the code EXECUTES correctly when Run is clicked (real Python via Pyodide).
//
// Mirrors patterns from tests/test_p0_p1.spec.js and tests/test_new_blocks.spec.js.
// Each test uses a DISTINCT snippet to dodge syncCodeToBlocks' snapshot-recovery shortcut.

const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

// Open app, go to Python tab, fill code, convert to blocks, return live block types.
async function convertPythonToBlocks(page, code) {
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

  const pythonTab = page.locator('#tab-btn-python');
  await expect(pythonTab).toBeVisible();
  await pythonTab.click();

  const pythonCode = page.locator('#python-code');
  await expect(pythonCode).toBeVisible();

  await page.waitForFunction(() => !!window.Blockly && !!window.Blockly.getMainWorkspace(),
    null, { timeout: 15000 });

  await pythonCode.fill('');
  await pythonCode.fill(code);
  await page.waitForTimeout(200);

  const syncButton = page.locator('#btn-sync-to-blocks');
  await expect(syncButton).toBeEnabled();
  await syncButton.click();
  await page.waitForTimeout(1000);

  return await page.evaluate(() =>
    window.Blockly.getMainWorkspace().getAllBlocks().map(b => b.type)
  );
}

// Return the text held by any lossy 'text'/'raw_statement' blocks (raw-source dump detector).
async function lossyTextDump(page) {
  return await page.evaluate(() =>
    window.Blockly.getMainWorkspace().getAllBlocks()
      .filter(b => b.type === 'text' || b.type === 'raw_statement')
      .map(b => {
        try { return b.getFieldValue('TEXT') || b.getFieldValue('CODE') || ''; }
        catch (e) { return ''; }
      })
  );
}

// Run the current program in Pyodide; poll the console until ready/done or timeout.
async function runAndGetConsole(page) {
  await page.locator('#tab-btn-logs').click();
  await page.locator('#btn-run').click();

  // Poll for up to ~30s: wait for Pyodide cold-start + execution to settle.
  let consoleText = '';
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    consoleText = (await page.locator('#console-logs').textContent()) || '';
    if (/Execution completed|✅/.test(consoleText) ||
        /\[Runtime Error\]|\[Parser Error\]/.test(consoleText)) {
      // Give one more tick for trailing output to flush.
      await page.waitForTimeout(1000);
      consoleText = (await page.locator('#console-logs').textContent()) || '';
      break;
    }
  }
  return consoleText;
}

test.describe('W1 exceptions & context managers', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  });

  // ---- 1. try_statement ----
  test('try_statement: renders and executes (prints 5 then fin)', async ({ page }) => {
    const code = 'try:\n    x = int("5")\n    print(x)\nexcept ValueError as e:\n    print("err")\nfinally:\n    print("fin")';
    const types = await convertPythonToBlocks(page, code);
    console.log('[try_statement] block types:', JSON.stringify(types));

    const lossy = await lossyTextDump(page);
    console.log('[try_statement] lossy text blocks:', JSON.stringify(lossy));

    expect(types, 'try_statement block should render').toContain('try_statement');
    expect(lossy.some(t => /try|except|finally/.test(String(t))),
      'raw try source must NOT be dumped into a text/raw_statement block').toBe(false);

    const out = await runAndGetConsole(page);
    console.log('[try_statement] console:', JSON.stringify(out));
    expect(out, 'should print 5').toContain('5');
    expect(out, 'should print fin').toContain('fin');
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
  });

  // ---- 2. raise_statement ----
  test('raise_statement: renders and executes (prints caught)', async ({ page }) => {
    const code = 'try:\n    raise ValueError("bad")\nexcept ValueError:\n    print("caught")';
    const types = await convertPythonToBlocks(page, code);
    console.log('[raise_statement] block types:', JSON.stringify(types));

    const lossy = await lossyTextDump(page);
    console.log('[raise_statement] lossy text blocks:', JSON.stringify(lossy));

    expect(types, 'raise_statement block should render').toContain('raise_statement');
    expect(lossy.some(t => /raise/.test(String(t))),
      'raw raise source must NOT be dumped into a text/raw_statement block').toBe(false);

    const out = await runAndGetConsole(page);
    console.log('[raise_statement] console:', JSON.stringify(out));
    expect(out, 'should print caught').toContain('caught');
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
  });

  // ---- 3. assert_statement ----
  test('assert_statement: renders and executes (prints ok)', async ({ page }) => {
    const code = 'assert 1 + 1 == 2\nprint("ok")';
    const types = await convertPythonToBlocks(page, code);
    console.log('[assert_statement] block types:', JSON.stringify(types));

    const lossy = await lossyTextDump(page);
    console.log('[assert_statement] lossy text blocks:', JSON.stringify(lossy));

    expect(types, 'assert_statement block should render').toContain('assert_statement');
    expect(lossy.some(t => /assert/.test(String(t))),
      'raw assert source must NOT be dumped into a text/raw_statement block').toBe(false);

    const out = await runAndGetConsole(page);
    console.log('[assert_statement] console:', JSON.stringify(out));
    expect(out, 'should print ok').toContain('ok');
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
  });

  // ---- 4. with_statement (render-only; file IO may not be feasible in Pyodide) ----
  test('with_statement: renders from a context-manager block', async ({ page }) => {
    const code = 'with open("f.txt") as fh:\n    data = fh.read()';
    const types = await convertPythonToBlocks(page, code);
    console.log('[with_statement] block types:', JSON.stringify(types));

    const lossy = await lossyTextDump(page);
    console.log('[with_statement] lossy text blocks:', JSON.stringify(lossy));

    expect(types, 'with_statement block should render').toContain('with_statement');
    expect(lossy.some(t => /with .* as/.test(String(t))),
      'raw with source must NOT be dumped into a text/raw_statement block').toBe(false);
    // Execution skipped: opening a real file in Pyodide's WASM FS is not feasible here.
  });
});
