// [Feature A] Real-workspace checks for the optional-type-hint blocks: var_assign and
// method_def must serialize -> load -> render -> workspaceToCode losslessly (this exercises
// updateShape_/extraState, which the Node specs never run), and the +type / +return toggles
// (changeType_ / changeReturn_) must add the annotation and regenerate it.
// Targets the Vite dev server on :3000 (Playwright auto-starts `npm run dev`).
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000/';

async function boot(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__blocklyWorkspace && window.BlockPyParser && window.Blockly && window.Blockly.Python,
    null, { timeout: 15000 }
  );
}

function regenerate(page, src) {
  return page.evaluate((code) => {
    const P = window.BlockPyParser;
    const ws = window.__blocklyWorkspace;
    const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
    ws.clear();
    window.Blockly.serialization.workspaces.load(P.astToBlockly(ast), ws);
    return window.Blockly.Python.workspaceToCode(ws);
  }, src);
}

test.describe('[Feature A] optional type hints — real workspace', () => {
  const CASES = [
    ['plain assignment', 'x = 5', 'x = 5'],
    ['annotated assignment', 'x: int = 5', 'x: int = 5'],
    ['annotation no value', 'count: int', 'count: int'],
    ['attribute target', 'self.data: list = []', 'self.data: list = []'],
    ['def no return', 'def f(a):\n    return a', 'def f(a):'],
    ['def with return', 'def f(a: int) -> str:\n    return a', 'def f(a: int) -> str:'],
  ];
  for (const [label, src, want] of CASES) {
    test(`${label}: round-trips through a live workspace`, async ({ page }) => {
      test.setTimeout(30000);
      await boot(page);
      const out = await regenerate(page, src);
      expect(out).toContain(want);
      if (label === 'def no return') expect(out).not.toContain('->');
    });
  }

  test('+type toggle adds an annotation to a plain assignment', async ({ page }) => {
    test.setTimeout(30000);
    await boot(page);
    const out = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      ws.clear();
      const b = ws.newBlock('var_assign');
      b.initSvg && b.initSvg();
      b.setFieldValue('total', 'VAR');
      b.changeType_(true);                 // press +type
      b.setFieldValue('int', 'ANNOTATION');
      return window.Blockly.Python.workspaceToCode(ws);
    });
    expect(out).toContain('total: int');
  });

  test('+return toggle adds a return annotation to a def', async ({ page }) => {
    test.setTimeout(30000);
    await boot(page);
    const out = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      ws.clear();
      const b = ws.newBlock('method_def');
      b.initSvg && b.initSvg();
      b.setFieldValue('compute', 'NAME');
      b.setFieldValue('a, b', 'PARAMS');
      b.changeReturn_(true);                 // press +return
      b.setFieldValue(' -> int', 'RETURNS');
      return window.Blockly.Python.workspaceToCode(ws);
    });
    expect(out).toContain('def compute(a, b) -> int:');
  });
});
