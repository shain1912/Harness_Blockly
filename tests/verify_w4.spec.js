// V4 verification suite: W4 "collection / literal" Blockly blocks.
// For each construct verify (1) RENDER: Python -> blocks via Convert produces the
// dedicated block type (and NOT a lossy raw_statement/text fallback), and
// (2) EXECUTE: clicking Run produces the expected stdout with no Parser/Runtime error.
//
// Blocks: dict_create, set_create, tuple_create, dict_comprehension,
// set_comprehension, gen_expression, set_attribute (subscript/attr assign),
// multiple_assign (a = b = 0 and tuple unpacking a, b = 1, 2).
//
// NOTE: each test uses a DISTINCT Python snippet because syncCodeToBlocks restores
// a saved snapshot when the normalized Python is unchanged (snapshot-recovery).

const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

// Set the #toggle-desugar checkbox to the desired state (dispatches the events a
// React controlled input needs) and confirm it settled.
async function setDesugar(page, desired) {
  const toggle = page.locator('#toggle-desugar');
  await expect(toggle).toBeVisible();
  if (desired) await toggle.check(); else await toggle.uncheck();
  await expect(toggle).toBeChecked({ checked: desired });
}

// Fill the Python editor, click Convert, return the live workspace block types.
async function convert(page, code) {
  const pythonCode = page.locator('#python-code');
  await expect(pythonCode).toBeVisible();
  await pythonCode.fill('');
  await pythonCode.fill(code);
  await page.waitForTimeout(200); // let React flush the controlled textarea
  const syncButton = page.locator('#btn-sync-to-blocks');
  await expect(syncButton).toBeEnabled();
  await syncButton.click();
  await page.waitForTimeout(1000);
  return await page.evaluate(() =>
    window.Blockly.getMainWorkspace().getAllBlocks(false).map(b => b.type)
  );
}

// Read the text held by any 'text' blocks (to detect lossy raw-source dumps).
async function textBlockContents(page) {
  return await page.evaluate(() =>
    window.Blockly.getMainWorkspace().getAllBlocks(false)
      .filter(b => b.type === 'text')
      .map(b => b.getFieldValue('TEXT'))
  );
}

// Click Run, wait for Pyodide (cold-start tolerant), return console text.
async function runAndGetConsole(page) {
  await page.locator('#tab-btn-logs').click();
  await page.waitForTimeout(200);
  await page.locator('#btn-run').click();

  // Poll up to ~60s for the run to complete (Pyodide cold start can be slow).
  const deadline = Date.now() + 60000;
  let text = '';
  while (Date.now() < deadline) {
    text = (await page.locator('#console-logs').textContent()) || '';
    if (/Execution completed/i.test(text) ||
        /\[Parser Error\]/.test(text) ||
        /\[Runtime Error\]/.test(text)) {
      break;
    }
    await page.waitForTimeout(1000);
  }
  return text;
}

test.beforeEach(async ({ page }) => {
  page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#tab-btn-python').click();
  await expect(page.locator('#python-code')).toBeVisible();
  await page.waitForFunction(() => !!window.Blockly && !!window.Blockly.getMainWorkspace(),
    null, { timeout: 15000 });
});

// ---- 1. dict_create ----
test('dict_create: renders + executes', async ({ page }) => {
  const code = 'd = {"a": 1, "b": 2}\nprint(d["a"])';
  const types = await convert(page, code);
  console.log('[dict_create] types:', JSON.stringify(types));
  const texts = await textBlockContents(page);
  console.log('[dict_create] text blocks:', JSON.stringify(texts));

  expect(types, 'no lossy raw_statement').not.toContain('raw_statement');
  expect(texts.some(t => /\{.*:.*\}/.test(String(t))), 'no raw dict source in text block').toBe(false);
  expect(types, 'dict_create should render').toContain('dict_create');

  const out = await runAndGetConsole(page);
  console.log('[dict_create] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/\b1\b/);
});

// ---- 2. set_create ----
test('set_create: renders + executes', async ({ page }) => {
  const code = 's = {1, 2, 3}\nprint(len(s))';
  const types = await convert(page, code);
  console.log('[set_create] types:', JSON.stringify(types));
  expect(types).not.toContain('raw_statement');
  expect(types, 'set_create should render').toContain('set_create');

  const out = await runAndGetConsole(page);
  console.log('[set_create] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/\b3\b/);
});

// ---- 3. tuple_create ----
test('tuple_create: renders + executes', async ({ page }) => {
  const code = 't = (10, 20, 30)\nprint(t[1])';
  const types = await convert(page, code);
  console.log('[tuple_create] types:', JSON.stringify(types));
  expect(types).not.toContain('raw_statement');
  expect(types, 'tuple_create should render').toContain('tuple_create');

  const out = await runAndGetConsole(page);
  console.log('[tuple_create] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/\b20\b/);
});

// ---- 4. dict_comprehension (desugar OFF) ----
test('dict_comprehension: renders + executes', async ({ page }) => {
  await setDesugar(page, false);
  const code = 'sq = {k: k*k for k in range(3)}\nprint(sq[2])';
  const types = await convert(page, code);
  console.log('[dict_comprehension] types:', JSON.stringify(types));
  expect(types).not.toContain('raw_statement');
  expect.soft(types, 'dict_comprehension should render (desugar OFF)').toContain('dict_comprehension');

  const out = await runAndGetConsole(page);
  console.log('[dict_comprehension] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/\b4\b/);
});

// ---- 5. set_comprehension (desugar OFF) ----
test('set_comprehension: renders + executes', async ({ page }) => {
  await setDesugar(page, false);
  const code = 'st = {x*2 for x in range(3)}\nprint(sorted(st))';
  const types = await convert(page, code);
  console.log('[set_comprehension] types:', JSON.stringify(types));
  expect(types).not.toContain('raw_statement');
  expect.soft(types, 'set_comprehension should render (desugar OFF)').toContain('set_comprehension');

  const out = await runAndGetConsole(page);
  console.log('[set_comprehension] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/\[0,\s*2,\s*4\]/);
});

// ---- 6. gen_expression (desugar OFF) ----
test('gen_expression: renders + executes', async ({ page }) => {
  await setDesugar(page, false);
  const code = 'g = (x for x in range(4))\nprint(sum(g))';
  const types = await convert(page, code);
  console.log('[gen_expression] types:', JSON.stringify(types));
  expect(types).not.toContain('raw_statement');
  expect.soft(types, 'gen_expression should render (desugar OFF)').toContain('gen_expression');

  const out = await runAndGetConsole(page);
  console.log('[gen_expression] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/\b6\b/);
});

// ---- 7. set_attribute (subscript assignment) ----
test('set_attribute: renders + executes', async ({ page }) => {
  const code = 'd = {}\nd["k"] = 7\nprint(d["k"])';
  const types = await convert(page, code);
  console.log('[set_attribute] types:', JSON.stringify(types));
  expect(types).not.toContain('raw_statement');
  expect(types, 'set_attribute should render').toContain('set_attribute');

  const out = await runAndGetConsole(page);
  console.log('[set_attribute] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/\b7\b/);
});

// ---- 8a. multiple_assign (a = b = 5) ----
test('multiple_assign chained: renders + executes', async ({ page }) => {
  const code = 'a = b = 5\nprint(a + b)';
  const types = await convert(page, code);
  console.log('[multiple_assign chained] types:', JSON.stringify(types));
  expect(types).not.toContain('raw_statement');
  expect(types, 'multiple_assign should render').toContain('multiple_assign');

  const out = await runAndGetConsole(page);
  console.log('[multiple_assign chained] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/\b10\b/);
});

// ---- 8b. multiple_assign (tuple unpacking x, y = 1, 2) ----
test('multiple_assign tuple-unpack: renders + executes', async ({ page }) => {
  const code = 'x, y = 1, 2\nprint(x, y)';
  const types = await convert(page, code);
  console.log('[multiple_assign unpack] types:', JSON.stringify(types));
  expect(types).not.toContain('raw_statement');
  expect.soft(types, 'tuple-unpack should render multiple_assign').toContain('multiple_assign');

  const out = await runAndGetConsole(page);
  console.log('[multiple_assign unpack] console:', JSON.stringify(out));
  expect(out).not.toContain('[Parser Error]');
  expect(out).not.toContain('[Runtime Error]');
  expect(out).toMatch(/1\s+2/);
});
