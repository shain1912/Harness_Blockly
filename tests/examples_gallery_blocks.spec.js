// VERIFICATION METHODOLOGY (requested): every gallery example, selected from the in-app
// "예제" dropdown and Converted, must actually PRODUCE VISIBLE BLOCKS — not just parse.
//
// The earlier gallery test only ran the code and checked stdout, so it silently passed
// even if Convert produced no blocks. This test drives the exact user path:
//   pick example -> Convert -> switch to Blockly tab -> assert real, on-screen blocks
// and asserts the workspace regenerates non-empty Python (so the blocks are wired, not
// empty shells).
const { test, expect } = require('@playwright/test');
const { DEMO_SNIPPETS } = require('../src/examples/snippets.js');

test.describe('every example converts to visible blocks', () => {
  for (const sn of DEMO_SNIPPETS) {
    test(`${sn.category}/${sn.id}`, async ({ page }) => {
      test.setTimeout(45000);
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

      // 1. Pick the example from the dropdown (real user path).
      await page.locator('#tab-btn-python').click();
      await page.locator('#example-picker').selectOption(sn.id);
      await page.waitForTimeout(150);

      // 2. The editor must hold this example's code.
      expect(await page.locator('#python-code').inputValue()).toBe(sn.code);

      // 3. Convert — must be Code Valid, never a Parser Error.
      await page.locator('#btn-sync-to-blocks').click();
      await page.waitForTimeout(700);
      const status = (await page.locator('#syntax-status-text').textContent()) || '';
      expect(status).not.toContain('Parser Error');

      // 4. Switch to the Blockly tab and assert real, on-screen blocks.
      await page.locator('#tab-btn-blockly').click();
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => {
        const ws = window.Blockly.getMainWorkspace();
        if (!ws) return { all: 0, topVisible: 0, code: '' };
        const top = ws.getTopBlocks(false);
        let topVisible = 0;
        for (const b of top) {
          const r = b.getSvgRoot().getBoundingClientRect();
          if (r.width > 0 && r.height > 0) topVisible++;
        }
        let code = '';
        try { code = window.Blockly.Python.workspaceToCode(ws) || ''; } catch (_) {}
        return { all: ws.getAllBlocks().length, topVisible, code: code.trim() };
      });

      // Blocks exist, are rendered on-screen, and regenerate non-empty Python.
      expect(info.all).toBeGreaterThan(0);
      expect(info.topVisible).toBeGreaterThan(0);
      expect(info.code.length).toBeGreaterThan(0);
    });
  }
});
