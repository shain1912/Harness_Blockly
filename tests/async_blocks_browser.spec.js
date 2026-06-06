// [W5] Block->code round-trip for async/await: prove the ASYNC_LABEL field and the
// await_expr/await_stmt blocks survive serialize -> load -> workspaceToCode, so the block
// view regenerates `async`/`await` (not just the Python-level AST round-trip).
//
// Targets the Vite dev server on :3000 (Playwright's webServer auto-starts `npm run dev`).
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000/';

const CASES = [
  ['async def + bare await', 'async def fetch():\n    await get()', ['async def fetch(', 'await get()']],
  ['await in assignment', 'async def main():\n    x = await load()', ['async def main(', 'x = await load()']],
  ['async for', 'async for item in stream():\n    print(item)', ['async for item in stream()']],
  ['async with', 'async with lock() as h:\n    read(h)', ['async with lock() as h:']],
  ['async for unpack', 'async for k, v in pairs():\n    print(k, v)', ['async for k, v in pairs()']],
];

test.describe('[W5] async/await block -> code round-trip (browser)', () => {
  for (const [label, code, expectedFragments] of CASES) {
    test(`${label}: workspace regenerates async/await`, async ({ page }) => {
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
