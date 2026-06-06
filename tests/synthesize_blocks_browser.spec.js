// [Phase 1] synthesizeBlocks in a live workspace: it must register only the specs that pass
// the parser oracle, and a hallucinated (non-round-trippable) spec must never become a block.
// Targets the Vite dev server on :3000.
const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:3000/';

test('synthesizeBlocks registers only oracle-passing specs in a live workspace', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__blockpyEngine && window.BlockPyParser && window.Blockly,
    null, { timeout: 15000 }
  );
  const report = await page.evaluate(() => {
    const eng = window.__blockpyEngine;
    const specs = [
      { type: 'macro_syn_ok', name: 'OK', slots: [{ id: 'n', label: 'N', type: 'number', default: 1 }], pythonTemplate: 'x = {n} + 1' },
      { type: 'macro_syn_bad', name: 'Bad', slots: [{ id: 'v', label: 'V', type: 'value', default: 'x' }], pythonTemplate: 'match {v}:\n    case 1:\n        pass' },
    ];
    const r = eng.synthesizeBlocks(specs);
    return {
      registered: r.registered,
      rejected: r.rejected.map(x => x.type),
      okExists: !!window.Blockly.Blocks['macro_syn_ok'],
      badExists: !!window.Blockly.Blocks['macro_syn_bad'],
    };
  });
  expect(report.registered).toEqual(['macro_syn_ok']);
  expect(report.rejected).toEqual(['macro_syn_bad']);
  expect(report.okExists).toBe(true);
  expect(report.badExists).toBe(false);
});
