// Verification suite for 8 newly-added Blockly blocks in BlockPy.
// For each construct: Python -> blocks (via Convert button), blocks -> Python
// (via Blockly.Python.workspaceToCode), and presence of the block definition
// (renders-in-toolbox proxy via Blockly.Blocks[type] !== undefined).
//
// NOTE: App.jsx's syncCodeToBlocks ALWAYS desugars before parsing. The desugarer
// (src/utils/desugarer.js) unrolls Ternary and ListComp into plain statements,
// so the Convert button may NOT produce logic_ternary / list_comprehension blocks.
// These tests assert the ACTUAL behavior and flag it, rather than papering over it.

const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

// Open the Python tab, type code, click Convert, and wait until the workspace
// reflects the sync. Returns the list of block types in the live workspace.
async function convertPythonToBlocks(page, code) {
  await page.goto(APP_URL);

  const pythonTab = page.locator('#tab-btn-python');
  await expect(pythonTab).toBeVisible();
  await pythonTab.click();

  const pythonCode = page.locator('#python-code');
  await expect(pythonCode).toBeVisible();

  // Wait for the Blockly workspace to be live.
  await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });

  await pythonCode.fill('');
  await pythonCode.fill(code);
  // Let React flush the controlled-textarea state before Convert reads `code`.
  await page.waitForTimeout(150);

  // NOTE: do NOT manually clear the workspace here. App's syncCodeToBlocks calls
  // Blockly.serialization.workspaces.load(), which fully replaces the workspace.
  // A manual clear() before the click races with React state and yields an empty
  // workspace.
  const syncButton = page.locator('#btn-sync-to-blocks');
  await expect(syncButton).toBeEnabled();
  await syncButton.click();

  // syncCodeToBlocks runs synchronously on click; allow a tick for the load.
  await page.waitForTimeout(600);

  return await page.evaluate(() =>
    window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type)
  );
}

async function generatedPython(page) {
  return await page.evaluate(() =>
    window.Blockly.Python.workspaceToCode(window.__blocklyWorkspace)
  );
}

async function blockDefined(page, type) {
  return await page.evaluate(
    (t) => typeof window.Blockly !== 'undefined' && window.Blockly.Blocks[t] !== undefined,
    type
  );
}

// Build a workspace directly from a block JSON tree (bypasses desugarer) so we can
// independently test the generator (blocks -> Python) for blocks that the Convert
// path desugars away.
async function loadBlockJson(page, blockJson) {
  await page.goto(APP_URL);
  await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
  // App mount fires a delayed syncCodeToBlocks(setTimeout 100ms) that loads the
  // star demo. Wait for that to land FIRST, otherwise it overwrites our block.
  await page.waitForTimeout(700);
  await page.evaluate((bj) => {
    const ws = window.__blocklyWorkspace;
    ws.clear();
    window.Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [bj] } }, ws);
  }, blockJson);
  // Confirm our block actually loaded and nothing clobbered it.
  await page.waitForFunction(
    (t) => {
      const ws = window.__blocklyWorkspace;
      const types = ws.getAllBlocks(false).map(b => b.type);
      return types.length > 0 && types.includes(t);
    },
    blockJson.type,
    { timeout: 5000 }
  );
}

test.describe('New block verification', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  });

  // ---- 1. logic_ternary ----
  test('logic_ternary: Python->block, block->Python, defined', async ({ page }) => {
    const code = 'speed = 120\nstatus = "Danger" if speed > 100 else "Safe"\nprint(status)';
    const types = await convertPythonToBlocks(page, code);
    console.log('[logic_ternary] block types from Convert:', JSON.stringify(types));

    // renders-in-toolbox proxy
    expect(await blockDefined(page, 'logic_ternary')).toBe(true);

    // Python->block via the Convert button.
    // KNOWN LIMITATION: App.jsx syncCodeToBlocks ALWAYS runs the desugarer, which
    // unrolls a Ternary into a temp-var + controls_if (see src/utils/desugarer.js
    // case 'Ternary'). Therefore Convert does NOT emit logic_ternary; it emits a
    // structural controls_if instead. This is lossless/correct (not a bare `text`
    // fallback of the source string), but the dedicated logic_ternary block is
    // unreachable from the Python->block direction.
    const hasTernary = types.includes('logic_ternary');
    const textBlocks = await page.evaluate(() =>
      window.__blocklyWorkspace.getAllBlocks(false)
        .filter(b => b.type === 'text')
        .map(b => b.getFieldValue('TEXT'))
    );
    console.log('[logic_ternary] text block contents:', JSON.stringify(textBlocks));
    console.log('[logic_ternary] hasTernary =', hasTernary,
      '(false expected: Convert desugars ternary -> controls_if)');
    // The source must NOT be dumped into a bare text block carrying the whole expr.
    const ternaryDumpedAsText = textBlocks.some(t => /if .* else/.test(String(t)));
    expect(ternaryDumpedAsText, 'ternary must not collapse into a bare text fallback').toBe(false);
    // Documented actual behavior: Convert desugars into a structural controls_if.
    expect(types.includes('controls_if') || hasTernary,
      'ternary should convert to controls_if (desugared) or logic_ternary').toBe(true);

    // block->Python round-trip via a directly-built logic_ternary block (generator test).
    // Use literal operands so output is deterministic (no variable id/name aliasing).
    await loadBlockJson(page, {
      type: 'logic_ternary',
      inputs: {
        IF: { block: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } },
        THEN: { block: { type: 'text', fields: { TEXT: 'Danger' } } },
        ELSE: { block: { type: 'text', fields: { TEXT: 'Safe' } } }
      }
    });
    const py = await generatedPython(page);
    console.log('[logic_ternary] generated Python:', JSON.stringify(py));
    // Expect "'Danger' if True else 'Safe'"
    expect(py).toMatch(/if/);
    expect(py).toMatch(/else/);
    expect(py).toMatch(/Danger/);
    expect(py).toMatch(/Safe/);
  });

  // ---- 2. list_comprehension ----
  test('list_comprehension: Python->block, block->Python, defined', async ({ page }) => {
    const code = 'numbers = [1, 2, 3, 4, 5]\ny = [x * 10 for x in numbers]\nprint(y)';
    const types = await convertPythonToBlocks(page, code);
    console.log('[list_comprehension] block types from Convert:', JSON.stringify(types));

    expect(await blockDefined(page, 'list_comprehension')).toBe(true);

    // KNOWN LIMITATION: syncCodeToBlocks always desugars; ListComp is unrolled into
    // an empty-list init + controls_forEach + list_append_custom (see desugarer.js
    // case 'ListComp'). So Convert does NOT emit list_comprehension; it emits a
    // structural loop instead. Lossless/correct, but the dedicated block is
    // unreachable from the Python->block direction.
    const hasComp = types.includes('list_comprehension');
    const textBlocks = await page.evaluate(() =>
      window.__blocklyWorkspace.getAllBlocks(false)
        .filter(b => b.type === 'text')
        .map(b => b.getFieldValue('TEXT'))
    );
    console.log('[list_comprehension] text block contents:', JSON.stringify(textBlocks));
    console.log('[list_comprehension] hasComp =', hasComp,
      '(false expected: Convert desugars listcomp -> controls_forEach + list_append_custom)');
    const compDumpedAsText = textBlocks.some(t => /for .* in/.test(String(t)));
    expect(compDumpedAsText, 'listcomp must not collapse into a bare text fallback').toBe(false);
    expect(types.includes('controls_forEach') || types.includes('controls_for') || hasComp,
      'listcomp should convert to a loop (desugared) or list_comprehension').toBe(true);

    // generator round-trip (directly-built block) with literal operands.
    await loadBlockJson(page, {
      type: 'list_comprehension',
      fields: { VAR: 'x' },
      inputs: {
        EXPR: { block: { type: 'math_number', fields: { NUM: 10 } } },
        ITER: { block: { type: 'lists_create_with', extraState: { itemCount: 0 } } }
      }
    });
    const py = await generatedPython(page);
    console.log('[list_comprehension] generated Python:', JSON.stringify(py));
    // Expect "[10 for x in []]"
    expect(py).toMatch(/for\s+x\s+in/);
  });

  // ---- 3. controls_pass ----
  test('controls_pass: Python->block, block->Python, defined', async ({ page }) => {
    const code = 'def noop():\n    pass';
    const types = await convertPythonToBlocks(page, code);
    console.log('[controls_pass] block types from Convert:', JSON.stringify(types));

    expect(await blockDefined(page, 'controls_pass')).toBe(true);
    expect.soft(types.includes('controls_pass'), 'pass statement should produce controls_pass').toBe(true);

    const py = await generatedPython(page);
    console.log('[controls_pass] generated Python:', JSON.stringify(py));
    expect(py).toMatch(/pass/);
  });

  // ---- 4. logic_null ----
  test('logic_null: Python->block, block->Python, defined', async ({ page }) => {
    const code = 'x = None';
    const types = await convertPythonToBlocks(page, code);
    console.log('[logic_null] block types from Convert:', JSON.stringify(types));

    expect(await blockDefined(page, 'logic_null')).toBe(true);
    expect.soft(types.includes('logic_null'), 'None should produce logic_null').toBe(true);

    const py = await generatedPython(page);
    console.log('[logic_null] generated Python:', JSON.stringify(py));
    expect(py).toMatch(/None/);
  });

  // ---- 5. import_statement ----
  test('import_statement: Python->block, block->Python, defined', async ({ page }) => {
    const code = 'import math\nimport numpy as np';
    const types = await convertPythonToBlocks(page, code);
    console.log('[import_statement] block types from Convert:', JSON.stringify(types));

    expect(await blockDefined(page, 'import_statement')).toBe(true);
    expect.soft(types.includes('import_statement'), 'import should produce import_statement (not dropped)').toBe(true);

    const py = await generatedPython(page);
    console.log('[import_statement] generated Python:', JSON.stringify(py));
    expect(py).toMatch(/import\s+math/);
  });

  // ---- 6. attribute_access ----
  test('attribute_access: Python->block, block->Python, defined', async ({ page }) => {
    // Attribute access only appears in expression context, so assign it.
    const code = 'pi_val = math.pi';
    const types = await convertPythonToBlocks(page, code);
    console.log('[attribute_access] block types from Convert:', JSON.stringify(types));

    expect(await blockDefined(page, 'attribute_access')).toBe(true);

    const hasAttr = types.includes('attribute_access');
    const textBlocks = await page.evaluate(() =>
      window.__blocklyWorkspace.getAllBlocks(false)
        .filter(b => b.type === 'text')
        .map(b => b.getFieldValue('TEXT'))
    );
    console.log('[attribute_access] text block contents:', JSON.stringify(textBlocks));
    expect.soft(hasAttr, 'math.pi should produce attribute_access (not a bare text fallback)').toBe(true);

    // generator round-trip (directly-built block). Use a text operand so the
    // object side is deterministic, then assert the ".pi" attribute is emitted.
    await loadBlockJson(page, {
      type: 'attribute_access',
      fields: { NAME: 'pi' },
      inputs: { OBJECT: { block: { type: 'text', fields: { TEXT: 'math' } } } }
    });
    const py = await generatedPython(page);
    console.log('[attribute_access] generated Python:', JSON.stringify(py));
    // Expect "'math'.pi" — the key assertion is the ".pi" attribute access.
    expect(py).toMatch(/\.pi/);
  });

  // ---- 7. unary minus fix ----
  test('unary minus: x = -5 should not produce a broken math_arithmetic block', async ({ page }) => {
    const code = 'x = -5';
    const types = await convertPythonToBlocks(page, code);
    console.log('[unary minus] block types from Convert:', JSON.stringify(types));

    // The fix maps unary minus to math_single(NEG), NOT a broken math_arithmetic.
    const hasArithmetic = types.includes('math_arithmetic');
    expect.soft(hasArithmetic, 'unary minus must NOT produce a math_arithmetic block').toBe(false);

    // Round-trip should regenerate a -5 (or equivalent negation).
    const py = await generatedPython(page);
    console.log('[unary minus] generated Python:', JSON.stringify(py));
    // Tolerate "-5", "(-5)", "-(5)", or "x = -5"
    expect(py.replace(/\s/g, '')).toMatch(/-\(?5\)?/);
  });

  // ---- 8. controls_flow_statements (break / continue) ----
  test('controls_flow_statements: break & continue, block->Python, defined', async ({ page }) => {
    const code = 'for i in range(10):\n    if i == 3:\n        break\n    continue';
    const types = await convertPythonToBlocks(page, code);
    console.log('[controls_flow_statements] block types from Convert:', JSON.stringify(types));

    expect(await blockDefined(page, 'controls_flow_statements')).toBe(true);
    expect.soft(types.includes('controls_flow_statements'),
      'break/continue should produce controls_flow_statements').toBe(true);

    const py = await generatedPython(page);
    console.log('[controls_flow_statements] generated Python:', JSON.stringify(py));
    expect(py).toMatch(/break/);
    expect(py).toMatch(/continue/);
  });

  // ---- All 8 block definitions exist (renders-in-toolbox proxy) ----
  test('all 8 new block types are defined in Blockly.Blocks', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => !!window.Blockly && !!window.Blockly.Blocks, null, { timeout: 15000 });
    const required = [
      'logic_ternary', 'list_comprehension', 'controls_pass', 'logic_null',
      'import_statement', 'attribute_access', 'controls_flow_statements'
    ];
    const results = {};
    for (const t of required) results[t] = await blockDefined(page, t);
    console.log('[block definitions]', JSON.stringify(results));
    for (const t of required) expect(results[t], `${t} must be defined`).toBe(true);
  });

  // ---- Toolbox flyout: Modules category renders import_statement + attribute_access ----
  test('Modules toolbox category contains import_statement and attribute_access', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
    // Inspect the toolbox definition (XML) used by the workspace.
    const modulesBlocks = await page.evaluate(() => {
      const tb = document.getElementById('toolbox');
      if (!tb) return null;
      const cats = Array.from(tb.querySelectorAll('category'));
      const mod = cats.find(c => c.getAttribute('name') === 'Modules');
      if (!mod) return null;
      return Array.from(mod.querySelectorAll('block')).map(b => b.getAttribute('type'));
    });
    console.log('[Modules category blocks]', JSON.stringify(modulesBlocks));
    expect(modulesBlocks).toContain('import_statement');
    expect(modulesBlocks).toContain('attribute_access');
  });
});

// ---------------------------------------------------------------------------
// Auto Desugar toggle behavior (NEW). The Convert/Sync handler now RESPECTS the
// "#toggle-desugar" checkbox: when OFF, advanced syntax (ternary, list comp)
// converts into the dedicated logic_ternary / list_comprehension blocks instead
// of being desugared into controls_if / loops; when ON (default), the old
// desugaring behavior is preserved.
// ---------------------------------------------------------------------------

// Set the "#toggle-desugar" checkbox to the desired state via real check/uncheck
// (dispatches the events a React controlled input needs) and confirm the state.
async function setDesugar(page, desired) {
  const toggle = page.locator('#toggle-desugar');
  await expect(toggle).toBeVisible();
  if (desired) {
    await toggle.check();
  } else {
    await toggle.uncheck();
  }
  // Confirm the controlled input actually settled to the requested state.
  await expect(toggle).toBeChecked({ checked: desired });
  expect(await toggle.isChecked()).toBe(desired);
}

// Fill the Python editor, click Sync, and return the live workspace block types.
// NOTE on the snapshot-recovery shortcut in syncCodeToBlocks: if the (whitespace/
// comment-normalized) Python is unchanged from a prior sync, it restores a saved
// snapshot instead of re-parsing — so each assertion below MUST use a distinct
// snippet. We do not rely on a clean page per call; callers pass unique code.
async function syncAndGetTypes(page, code) {
  const pythonCode = page.locator('#python-code');
  await expect(pythonCode).toBeVisible();
  await pythonCode.fill('');
  await pythonCode.fill(code);
  // Let React flush the controlled-textarea state before Sync reads `code`.
  await page.waitForTimeout(150);

  const syncButton = page.locator('#btn-sync-to-blocks');
  await expect(syncButton).toBeEnabled();
  await syncButton.click();
  // syncCodeToBlocks runs synchronously on click; allow a tick for the load.
  await page.waitForTimeout(600);

  return await page.evaluate(() =>
    window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type)
  );
}

test.describe('Auto Desugar toggle', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
    await page.goto(APP_URL);
    const pythonTab = page.locator('#tab-btn-python');
    await expect(pythonTab).toBeVisible();
    await pythonTab.click();
    await expect(page.locator('#python-code')).toBeVisible();
    await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
  });

  // ---- Desugar OFF: ternary keeps its dedicated logic_ternary block ----
  test('desugar OFF: ternary -> logic_ternary (no controls_if)', async ({ page }) => {
    await setDesugar(page, false);

    const code = 'status = "Danger" if 50 > 100 else "Safe"';
    const types = await syncAndGetTypes(page, code);
    console.log('[desugar OFF ternary] block types:', JSON.stringify(types));

    expect(types, 'workspace should contain logic_ternary when desugar is OFF').toContain('logic_ternary');
    expect(types, 'workspace should NOT desugar ternary into controls_if when desugar is OFF').not.toContain('controls_if');
  });

  // ---- Desugar OFF: list comp keeps its dedicated list_comprehension block ----
  test('desugar OFF: list comp -> list_comprehension (no loop/append)', async ({ page }) => {
    await setDesugar(page, false);

    const code = 'numbers = [1, 2, 3]\ny = [x * 10 for x in numbers]';
    const types = await syncAndGetTypes(page, code);
    console.log('[desugar OFF listcomp] block types:', JSON.stringify(types));

    expect(types, 'workspace should contain list_comprehension when desugar is OFF').toContain('list_comprehension');
    expect(types, 'workspace should NOT desugar listcomp into a controls_forEach loop when desugar is OFF').not.toContain('controls_forEach');
    expect(types, 'workspace should NOT desugar listcomp into list_append_custom when desugar is OFF').not.toContain('list_append_custom');
  });

  // ---- Desugar ON (default, preserved): ternary still desugars to controls_if ----
  test('desugar ON: ternary still desugars to controls_if (preserved)', async ({ page }) => {
    // Default state is ON; re-check explicitly to assert the toggle path works.
    await setDesugar(page, true);

    // Distinct snippet from the desugar-OFF ternary test to dodge the
    // snapshot-recovery shortcut in syncCodeToBlocks.
    const code = 'label = "High" if 200 > 100 else "Low"';
    const types = await syncAndGetTypes(page, code);
    console.log('[desugar ON ternary] block types:', JSON.stringify(types));

    expect(types, 'workspace should desugar ternary into controls_if when desugar is ON').toContain('controls_if');
    expect(types, 'workspace should NOT emit logic_ternary when desugar is ON').not.toContain('logic_ternary');
  });

  // ---- Single page: flip the toggle between runs with distinct snippets ----
  // Exercises both states in one session to prove the toggle is live and that
  // the snapshot-recovery shortcut does not leak state across distinct snippets.
  test('toggling desugar mid-session switches ternary block output', async ({ page }) => {
    // OFF first -> dedicated block
    await setDesugar(page, false);
    const offTypes = await syncAndGetTypes(page, 'a = "X" if 1 > 2 else "Y"');
    console.log('[toggle session OFF] types:', JSON.stringify(offTypes));
    expect(offTypes).toContain('logic_ternary');
    expect(offTypes).not.toContain('controls_if');

    // ON next (distinct snippet) -> desugared
    await setDesugar(page, true);
    const onTypes = await syncAndGetTypes(page, 'b = "P" if 3 > 4 else "Q"');
    console.log('[toggle session ON] types:', JSON.stringify(onTypes));
    expect(onTypes).toContain('controls_if');
    expect(onTypes).not.toContain('logic_ternary');
  });
});
