// [W7] Block->code round-trip for type annotations: prove the ann_assign block and the
// method_def RETURNS field survive serialize -> load -> workspaceToCode, so the block view
// regenerates `x: int = 5` and `-> str` (not just the Python-level AST round-trip).
//
// Targets the Vite dev server on :3000 (Playwright's webServer auto-starts `npm run dev`).
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000/';

const CASES = [
  ['ann-assign with value', 'x: int = 5', ['x: int = 5']],
  ['ann-assign no value', 'x: int', ['x: int']],
  ['ann-assign generic', 'names: list[str] = []', ['names: list[str] = []']],
  ['return annotation', 'def f(a: int) -> str:\n    return a', ['def f(a: int) -> str:', 'return a']],
  ['return annotation None', 'def g(a: int) -> None:\n    return None', ['def g(a: int) -> None:']],
];

test.describe('[W7] type annotation block -> code round-trip (browser)', () => {
  for (const [label, code, expectedFragments] of CASES) {
    test(`${label}: workspace regenerates the annotation`, async ({ page }) => {
      test.setTimeout(30000);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => window.__blocklyWorkspace && window.BlockPyParser && window.Blockly && window.Blockly.Python,
        null, { timeout: 15000 }
      );

      const out = await page.evaluate((src) => {
        const P = window.BlockPyParser;
        const ws = window.__blocklyWorkspace;
        const ast = new P.Parser(new P.Tokenizer(src).tokenize()).parse();
        const bj = P.astToBlockly(ast);
        ws.clear();
        window.Blockly.serialization.workspaces.load(bj, ws);
        return window.Blockly.Python.workspaceToCode(ws);
      }, code);

      for (const frag of expectedFragments) {
        expect(out).toContain(frag);
      }
    });
  }
});
