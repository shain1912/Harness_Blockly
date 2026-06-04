// Renderer-lock regression: the Blockly workspace must use the zelos (Scratch3/MakeCode)
// renderer. Guards against an accidental revert to geras.
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

test.describe('Blockly uses the zelos (Scratch3) renderer', () => {
  test('workspace renderer option is zelos', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
    const info = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      return {
        optRenderer: ws.options && ws.options.renderer,
        rendererClass: ws.getRenderer ? ws.getRenderer().getClassName() : '',
      };
    });
    expect(info.optRenderer).toBe('zelos');
    expect(info.rendererClass).toContain('zelos');
  });

  test('blocks still render and regenerate code under zelos (visual capture)', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
    // The app auto-loads a demo on mount; wait for it to render as blocks.
    await page.waitForFunction(() => window.__blocklyWorkspace.getAllBlocks(false).length > 0, null, { timeout: 15000 });
    await page.locator('#tab-btn-blockly').click().catch(() => {});
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      let code = '';
      try { code = window.Blockly.Python.workspaceToCode(ws) || ''; } catch (_) {}
      return { count: ws.getAllBlocks(false).length, codeLen: code.trim().length };
    });
    expect(info.count).toBeGreaterThan(0);
    expect(info.codeLen).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/zelos-look.png', fullPage: false });
  });
});
