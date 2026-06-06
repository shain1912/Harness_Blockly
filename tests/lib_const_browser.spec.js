// [Feature B Phase 1] Real-workspace check: lib_const instantiates (FieldDropdown with
// dynamic options + loadExtraState ordering) and regenerates `lib.CONST` — including a
// constant NOT in the seed list (data.haarcascades), which must still round-trip.
// Targets the Vite dev server on :3000.
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000/';

test.describe('[Feature B] lib_const — real workspace', () => {
  const CASES = [
    ['seed constant', 'import cv2\nc = cv2.COLOR_BGR2GRAY', 'cv2.COLOR_BGR2GRAY'],
    ['non-seed nested attribute', 'import cv2\np = cv2.data.haarcascades', 'cv2.data.haarcascades'],
    ['constant as a call argument', 'import cv2\ng = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)', 'cv2.COLOR_BGR2GRAY'],
  ];
  for (const [label, src, want] of CASES) {
    test(`${label}: regenerates ${want}`, async ({ page }) => {
      test.setTimeout(30000);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => window.__blocklyWorkspace && window.BlockPyParser && window.Blockly && window.Blockly.Python,
        null, { timeout: 15000 }
      );
      const out = await page.evaluate((code) => {
        const P = window.BlockPyParser;
        const ws = window.__blocklyWorkspace;
        const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
        ws.clear();
        window.Blockly.serialization.workspaces.load(P.astToBlockly(ast), ws);
        return window.Blockly.Python.workspaceToCode(ws);
      }, src);
      expect(out).toContain(want);
    });
  }
});
