// [Phase 1, 1.2] registerFromFacts wires introspection facts to real blocks in a live
// workspace: functions/classes become lib_<lib>_<name> call blocks with real arg names, and
// constants seed the lib_const dropdown. Uses a fixture (deterministic — no live Pyodide).
// Targets the Vite dev server on :3000.
const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:3000/';

test('registerFromFacts registers function/class blocks and seeds constant dropdown', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__blockpyEngine && window.BlockPyParser && window.Blockly,
    null, { timeout: 15000 }
  );
  const out = await page.evaluate(() => {
    const eng = window.__blockpyEngine;
    const facts = {
      module: 'demolib',
      functions: [{ name: 'process', params: ['data', 'mode'] }],
      classes: [{ name: 'Engine', params: ['opts'] }],
      constants: ['FAST', 'SLOW'],
    };
    const r = eng.registerFromFacts(facts);
    return {
      registered: r.registered ? null : r, // keep shape stable
      functions: r.functions,
      constants: r.constants,
      procExists: !!window.Blockly.Blocks['lib_demolib_process'],
      engineExists: !!window.Blockly.Blocks['lib_demolib_Engine'],
      seeds: window.BlockPyParser.getLibConstSeeds('demolib'),
    };
  });
  expect(out.functions).toEqual(['lib_demolib_process', 'lib_demolib_Engine']);
  expect(out.constants).toBe(2);
  expect(out.procExists).toBe(true);
  expect(out.engineExists).toBe(true);
  expect(out.seeds).toContain('FAST');
  expect(out.seeds).toContain('SLOW');
});
