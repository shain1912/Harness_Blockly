// Regression for method_def: class methods / nested defs become real connectable
// blocks (not gray raw_statement), with byte-identical text round-trips.
const { test, expect } = require('@playwright/test');
const P = require('../src/utils/parser.js');

const APP_URL = 'http://localhost:3000';

// ---- Browser helpers (mirror tests/test_new_blocks.spec.js) ----
async function convertPythonToBlocks(page, code) {
  await page.goto(APP_URL);
  await page.locator('#tab-btn-python').click();
  await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
  await page.locator('#python-code').fill('');
  await page.locator('#python-code').fill(code);
  await page.waitForTimeout(150);
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(600);
  return await page.evaluate(() => window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type));
}
async function generatedPython(page) {
  return await page.evaluate(() => window.Blockly.Python.workspaceToCode(window.__blocklyWorkspace));
}

test.describe('method_def block definition', () => {
  test('block + generator are registered and emit a def from a serialized workspace', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => !!window.Blockly && !!window.__blocklyWorkspace, null, { timeout: 15000 });
    const out = await page.evaluate(() => {
      const defined = !!window.Blockly.Blocks['method_def'] && !!window.Blockly.Python['method_def'];
      const json = { blocks: { languageVersion: 0, blocks: [{
        type: 'method_def',
        fields: { DECORATORS: '', NAME: '__init__', PARAMS: 'self, name' },
        inputs: { BODY: { block: { type: 'raw_statement', fields: { STMT: 'self.name = name' } } } }
      }]}};
      window.Blockly.serialization.workspaces.load(json, window.__blocklyWorkspace);
      const code = window.Blockly.Python.workspaceToCode(window.__blocklyWorkspace);
      return { defined, code: code.trim() };
    });
    expect(out.defined).toBe(true);
    expect(out.code).toBe('def __init__(self, name):\n  self.name = name');
  });
});
