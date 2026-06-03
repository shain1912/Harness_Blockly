// W2 verification: Scope / generator / import-family Blockly blocks.
// For each block type: (1) RENDER — Python -> blocks via Convert produces the
// dedicated block (no lossy raw_statement/text holding the source), and
// (2) EXECUTE — Run via Pyodide produces the expected output.
//
// Patterns mirror tests/test_p0_p1.spec.js, tests/test_new_blocks.spec.js,
// and tests/test_pyodide.spec.js. The Vite dev server at :3000 is reused.

const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

// Wait for text to appear in #console-logs (long timeout for Pyodide cold start).
async function waitForLog(page, text, timeout = 90000) {
  await page.waitForFunction(
    (t) => document.querySelector('#console-logs')?.textContent?.includes(t),
    text,
    { timeout }
  );
}

// Fill Python, Convert to blocks, return the live workspace block types.
async function convertAndGetTypes(page, code) {
  await page.locator('#tab-btn-python').click();
  await expect(page.locator('#python-code')).toBeVisible();
  await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });

  await page.locator('#python-code').fill('');
  await page.locator('#python-code').fill(code);
  await page.waitForTimeout(150);

  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(1000);

  return await page.evaluate(() =>
    window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type)
  );
}

// Assert the expected block rendered and that the source did not collapse into a
// lossy raw_statement / text fallback block.
function assertRendered(types, expectedType, label) {
  expect(types, `[${label}] expected ${expectedType}; got ${JSON.stringify(types)}`)
    .toContain(expectedType);
  expect(types, `[${label}] source must NOT collapse into a lossy raw_statement block`)
    .not.toContain('raw_statement');
}

// Run the currently-filled Python in Pyodide and return the console text once the
// expected marker appears (or completion is signalled).
async function runAndGetConsole(page, expectMarker) {
  await page.locator('#tab-btn-logs').click();
  await page.waitForTimeout(100);
  await page.locator('#btn-run').click();
  // Wait for the expected output; fall back is the completion marker via the
  // expectMarker the caller passes.
  await waitForLog(page, expectMarker, 90000);
  return await page.locator('#console-logs').textContent();
}

function assertNoErrors(consoleText, label) {
  expect(consoleText, `[${label}] parser error in console`).not.toContain('[Parser Error]');
  expect(consoleText, `[${label}] runtime error in console`).not.toContain('[Runtime Error]');
}

test.describe('W2 scope/generator/import-family blocks', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  });

  // ---- 1. from_import_statement ----
  test('from_import_statement: renders + executes (sqrt(16) -> 4.0)', async ({ page }) => {
    test.setTimeout(150000);
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const code = 'from math import sqrt\nprint(sqrt(16))';
    const types = await convertAndGetTypes(page, code);
    console.log('[from_import_statement] types:', JSON.stringify(types));
    assertRendered(types, 'from_import_statement', 'from_import_statement');

    const consoleText = await runAndGetConsole(page, '4.0');
    console.log('[from_import_statement] console:', consoleText);
    expect(consoleText).toContain('4.0');
    assertNoErrors(consoleText, 'from_import_statement');
  });

  // ---- 2. del_statement ----
  test('del_statement: renders + executes (prints deleted)', async ({ page }) => {
    test.setTimeout(150000);
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const code = 'x = 5\ndel x\nprint("deleted")';
    const types = await convertAndGetTypes(page, code);
    console.log('[del_statement] types:', JSON.stringify(types));
    assertRendered(types, 'del_statement', 'del_statement');

    const consoleText = await runAndGetConsole(page, 'deleted');
    console.log('[del_statement] console:', consoleText);
    expect(consoleText).toContain('deleted');
    assertNoErrors(consoleText, 'del_statement');
  });

  // ---- 3. global_statement ----
  test('global_statement: renders + executes (counter -> 1)', async ({ page }) => {
    test.setTimeout(150000);
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const code = 'counter = 0\ndef inc():\n    global counter\n    counter = counter + 1\ninc()\nprint(counter)';
    const types = await convertAndGetTypes(page, code);
    console.log('[global_statement] types:', JSON.stringify(types));
    assertRendered(types, 'global_statement', 'global_statement');

    const consoleText = await runAndGetConsole(page, '1');
    console.log('[global_statement] console:', consoleText);
    expect(consoleText).toMatch(/(^|\n|\s)1(\s|$|\n)/);
    assertNoErrors(consoleText, 'global_statement');
  });

  // ---- 4. nonlocal_statement ----
  test('nonlocal_statement: renders + executes (outer() -> 5)', async ({ page }) => {
    test.setTimeout(150000);
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const code = 'def outer():\n    n = 0\n    def inner():\n        nonlocal n\n        n = 5\n    inner()\n    return n\nprint(outer())';
    const types = await convertAndGetTypes(page, code);
    console.log('[nonlocal_statement] types:', JSON.stringify(types));
    assertRendered(types, 'nonlocal_statement', 'nonlocal_statement');

    const consoleText = await runAndGetConsole(page, '5');
    console.log('[nonlocal_statement] console:', consoleText);
    expect(consoleText).toContain('5');
    assertNoErrors(consoleText, 'nonlocal_statement');
  });

  // ---- 5. yield_statement ----
  test('yield_statement: renders + executes (list(gen()) -> [1, 2])', async ({ page }) => {
    test.setTimeout(150000);
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const code = 'def gen():\n    yield 1\n    yield 2\nprint(list(gen()))';
    const types = await convertAndGetTypes(page, code);
    console.log('[yield_statement] types:', JSON.stringify(types));
    assertRendered(types, 'yield_statement', 'yield_statement');

    const consoleText = await runAndGetConsole(page, '[1, 2]');
    console.log('[yield_statement] console:', consoleText);
    expect(consoleText).toContain('[1, 2]');
    assertNoErrors(consoleText, 'yield_statement');
  });
});
