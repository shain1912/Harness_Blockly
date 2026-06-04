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
});
