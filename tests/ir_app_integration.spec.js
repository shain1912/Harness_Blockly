// IR pipeline -> App integration. Drives the REAL app UI (not the modules in isolation):
// type Python -> click Convert -> the live workspace fills with ir_* blocks via the CPython-3.12
// ast IR pipeline; then a block field edit regenerates Python through the async block->code
// listener. Proves the conversion engine swap is wired end to end. Targets the dev server
// (Playwright auto-starts `npm run dev`; PORT overridable for the :3100 single-run setup).
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

test.describe('IR pipeline app integration', () => {
  test('Convert wires Python -> ir_* blocks, and block edits regenerate Python live', async ({ page }) => {
    test.setTimeout(200000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    // Pyodide pre-warms on load; the IR modules are window globals.
    await page.waitForFunction(
      () => window.__pyodide && window.__blocklyWorkspace && window.BlockPyIR && window.BlockPyAstBridge,
      null, { timeout: 180000 });

    const code = 'x = 1\nif x > 0:\n    print(x)';
    await page.locator('#tab-btn-python').click();
    await page.locator('#python-code').fill(code);
    await page.locator('#btn-sync-to-blocks').click();

    // Python -> blocks: the live workspace now holds only ir_* blocks (legacy parser retired).
    await page.waitForFunction(() => {
      const ws = window.__blocklyWorkspace;
      const saved = window.Blockly.serialization.workspaces.save(ws);
      const tops = (saved.blocks && saved.blocks.blocks) || [];
      return tops.length > 0 && tops.every((b) => b.type.startsWith('ir_'));
    }, null, { timeout: 60000 });

    // block -> Python via the same pipeline the change listener uses, on the live workspace.
    const regen = await page.evaluate(async () => {
      const ws = window.__blocklyWorkspace;
      const snap = window.Blockly.serialization.workspaces.save(ws);
      const ir = window.BlockPyIR.blocklyToIr(snap);
      const py = await window.BlockPyAstBridge.getPyodide();
      return (await window.BlockPyAstBridge.irToPython(py, ir)).replace(/\n$/, '');
    });
    expect(regen).toBe(code);

    // Live block->code listener: edit a constant block; the editor regenerates Python through the
    // async (debounced) IR path. Original code has no '5', so its appearance proves the edit
    // propagated to the source via blocklyToIr -> irToPython, not the retired generator. (The
    // FieldVariable round-trip is covered by ir_roundtrip/ir_toolbox; here we just exercise the
    // live listener with a plain text field.)
    await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      const blk = ws.getAllBlocks(false).find((b) => b.type === 'ir_const' && b.getFieldValue('VALUE') === '1');
      blk.setFieldValue('5', 'VALUE');
    });
    await page.waitForFunction(
      () => document.getElementById('python-code').value.includes('x = 5'),
      null, { timeout: 15000 });
  });
});
