// [W6] Block->code round-trip for for/else & while/else: the for_else / while_else blocks
// must regenerate the `else:` branch on block->code. Targets the Vite dev server on :3000.
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000/';

const CASES = [
  ['for/else', 'for x in items:\n    print(x)\nelse:\n    done()', ['for x in items:', 'else:', 'done()']],
  ['while/else', 'while cond():\n    step()\nelse:\n    finish()', ['while cond():', 'else:', 'finish()']],
  ['async for/else', 'async for x in stream():\n    handle(x)\nelse:\n    cleanup()', ['async for x in stream():', 'else:', 'cleanup()']],
];

test.describe('[W6] for/else & while/else block -> code round-trip (browser)', () => {
  for (const [label, code, fragments] of CASES) {
    test(`${label}: workspace regenerates the else branch`, async ({ page }) => {
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
      for (const frag of fragments) expect(out).toContain(frag);
    });
  }
});
