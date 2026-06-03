// W3 operator-block verification (V3).
// For each operator construct: Python -> blocks (Convert) must RENDER a real
// dedicated block (no lossy raw_statement/text dump of the source), and Run must
// EXECUTE in Pyodide producing the expected console output.
//
// Block types under test:
//   math_int_divide (//), bitwise_operation (& | ^ << >>), bitwise_not (~),
//   identity_test (is / is not), membership_test (in / not in),
//   augmented-assignment block (//= %= **= &= |= ^= >>= <<=).
//
// NOTE: App.jsx syncCodeToBlocks ALWAYS desugars before parsing. Each test uses a
// DISTINCT Python snippet to dodge the snapshot-recovery shortcut (which restores a
// saved snapshot when whitespace/comment-normalized Python is unchanged).

const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

async function gotoApp(page) {
  page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
  // App mount fires a delayed syncCodeToBlocks(setTimeout ~100ms) that loads the
  // demo; let it land before we drive our own conversions.
  await page.waitForTimeout(700);
}

// Fill the Python editor with `code`, click Convert, return live workspace block types.
async function convert(page, code) {
  await page.locator('#tab-btn-python').click();
  const pythonCode = page.locator('#python-code');
  await expect(pythonCode).toBeVisible();
  await pythonCode.fill('');
  await pythonCode.fill(code);
  await page.waitForTimeout(150); // let React flush controlled-textarea state
  const syncButton = page.locator('#btn-sync-to-blocks');
  await expect(syncButton).toBeEnabled();
  await syncButton.click();
  await page.waitForTimeout(1000);
  return await page.evaluate(() =>
    window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type)
  );
}

// Return the TEXT held by any lossy fallback blocks (raw_statement / text).
async function lossyText(page) {
  return await page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    const out = [];
    for (const b of ws.getAllBlocks(false)) {
      if (b.type === 'raw_statement' || b.type === 'text') {
        const fields = ['CODE', 'TEXT', 'VALUE', 'STATEMENT'];
        for (const f of fields) {
          try {
            const v = b.getFieldValue(f);
            if (v != null) out.push({ type: b.type, value: String(v) });
          } catch (e) { /* field absent */ }
        }
      }
    }
    return out;
  });
}

// Click Run, poll the console until Pyodide finishes (or timeout), return console text.
async function run(page, { timeout = 45000 } = {}) {
  await page.locator('#tab-btn-logs').click();
  await page.locator('#btn-run').click();
  const deadline = Date.now() + timeout;
  let text = '';
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    text = (await page.locator('#console-logs').textContent()) || '';
    if (
      text.includes('Execution completed') ||
      text.includes('[Runtime Error]') ||
      text.includes('[Parser Error]')
    ) {
      break;
    }
  }
  return text;
}

// Assert: dedicated block rendered, no lossy fallback carrying the source.
async function assertRendered(page, types, expectedType, sourceFragment) {
  console.log(`[${expectedType}] block types: ${JSON.stringify(types)}`);
  const lossy = await lossyText(page);
  console.log(`[${expectedType}] lossy fallback blocks: ${JSON.stringify(lossy)}`);
  // Never dump the raw operator source into a fallback block.
  const dumped = lossy.some(l => sourceFragment && l.value.includes(sourceFragment));
  expect(dumped, `${expectedType}: source must not collapse into a raw_statement/text fallback`).toBe(false);
  expect(types, `${expectedType}: dedicated block must render`).toContain(expectedType);
}

test.describe('W3 operator blocks: render + execute', () => {

  // ---- 1. math_int_divide (//) ----
  test('math_int_divide: print(17 // 5) -> renders math_int_divide, prints 3', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'print(17 // 5)');
    await assertRendered(page, types, 'math_int_divide', '17 // 5');

    const out = await run(page);
    console.log('[math_int_divide] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('3');
  });

  // ---- 2a. bitwise_operation: AND ----
  test('bitwise_operation &: print(6 & 3) -> renders bitwise_operation, prints 2', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'print(6 & 3)');
    await assertRendered(page, types, 'bitwise_operation', '6 & 3');

    const out = await run(page);
    console.log('[bitwise &] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('2');
  });

  // ---- 2b. bitwise_operation: OR ----
  test('bitwise_operation |: print(5 | 2) -> renders bitwise_operation, prints 7', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'print(5 | 2)');
    await assertRendered(page, types, 'bitwise_operation', '5 | 2');

    const out = await run(page);
    console.log('[bitwise |] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('7');
  });

  // ---- 2c. bitwise_operation: LEFT SHIFT ----
  test('bitwise_operation <<: print(1 << 4) -> renders bitwise_operation, prints 16', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'print(1 << 4)');
    await assertRendered(page, types, 'bitwise_operation', '1 << 4');

    const out = await run(page);
    console.log('[bitwise <<] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('16');
  });

  // ---- 3. bitwise_not (~) ----
  test('bitwise_not: print(~5) -> renders bitwise_not, prints -6', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'print(~5)');
    await assertRendered(page, types, 'bitwise_not', '~5');

    const out = await run(page);
    console.log('[bitwise_not] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('-6');
  });

  // ---- 4. identity_test (is) ----
  test('identity_test: x is None -> renders identity_test, prints True', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'x = None\nprint(x is None)');
    await assertRendered(page, types, 'identity_test', 'is None');

    const out = await run(page);
    console.log('[identity_test] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('True');
  });

  // ---- 5. membership_test (in) ----
  test('membership_test: 3 in [1,2,3] -> renders membership_test, prints True', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'print(3 in [1, 2, 3])');
    await assertRendered(page, types, 'membership_test', 'in [1, 2, 3]');

    const out = await run(page);
    console.log('[membership_test] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('True');
  });

  // ---- 6a. augmented assignment: //= ----
  test('aug-assign //=: n=17; n//=5; print(n) -> renders aug-assign block, prints 3', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'n = 17\nn //= 5\nprint(n)');
    console.log('[aug //=] block types:', JSON.stringify(types));

    const lossy = await lossyText(page);
    console.log('[aug //=] lossy fallback blocks:', JSON.stringify(lossy));
    const dumped = lossy.some(l => l.value.includes('//='));
    expect(dumped, 'aug-assign //= must not collapse into a raw fallback').toBe(false);

    // W3 DESIGN (parser.js case 'AugAssign'): an augmented assignment desugars to a
    // plain `variables_set` whose VALUE is the corresponding operator block — i.e.
    // `n //= 5` renders as `n = n // 5` -> variables_set + math_int_divide. This is
    // lossless and correct; there is no dedicated aug-assign block type.
    expect(types, 'aug-assign renders a variables_set').toContain('variables_set');
    expect(types, 'aug-assign //= uses the math_int_divide operator block').toContain('math_int_divide');
    console.log('[aug //=] desugared to variables_set + math_int_divide (no dedicated aug block)');

    const out = await run(page);
    console.log('[aug //=] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('3');
  });

  // ---- 6b. augmented assignment: **= ----
  test('aug-assign **=: p=2; p**=10; print(p) -> renders aug-assign block, prints 1024', async ({ page }) => {
    await gotoApp(page);
    const types = await convert(page, 'p = 2\np **= 10\nprint(p)');
    console.log('[aug **=] block types:', JSON.stringify(types));

    const lossy = await lossyText(page);
    console.log('[aug **=] lossy fallback blocks:', JSON.stringify(lossy));
    const dumped = lossy.some(l => l.value.includes('**='));
    expect(dumped, 'aug-assign **= must not collapse into a raw fallback').toBe(false);

    // W3 DESIGN: `p **= 10` desugars to `p = p ** 10` -> variables_set +
    // math_arithmetic(POWER). Lossless; no dedicated aug-assign block type.
    expect(types, 'aug-assign renders a variables_set').toContain('variables_set');
    expect(types, 'aug-assign **= uses the math_arithmetic (POWER) operator block').toContain('math_arithmetic');
    console.log('[aug **=] desugared to variables_set + math_arithmetic (no dedicated aug block)');

    const out = await run(page);
    console.log('[aug **=] console:', out);
    expect(out).not.toContain('[Parser Error]');
    expect(out).not.toContain('[Runtime Error]');
    expect(out).toContain('1024');
  });
});
