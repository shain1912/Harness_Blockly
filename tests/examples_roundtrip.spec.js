// Proves every demo gallery snippet is lossless and runnable — the "test code" role.
// Same DEMO_SNIPPETS list that drives the in-app Examples dropdown (single source of truth).
const { test, expect } = require('@playwright/test');
const { DEMO_SNIPPETS } = require('../src/examples/snippets.js');
const P = require('../src/utils/parser.js');

const norm = (s) => s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();

test.describe('demo snippets — AST round-trip is lossless', () => {
  for (const sn of DEMO_SNIPPETS) {
    test(`${sn.category}/${sn.id} round-trips`, () => {
      const ast = new P.Parser(new P.Tokenizer(sn.code).tokenize()).parse();
      expect(norm(P.astToPython(ast))).toBe(norm(sn.code));
    });
  }
});

test.describe('demo snippets — render to blocks & execute', () => {
  for (const sn of DEMO_SNIPPETS.filter((s) => s.execute)) {
    test(`${sn.category}/${sn.id} renders & runs`, async ({ page }) => {
      test.setTimeout(90000); // Pyodide cold-start (~10MB) can exceed the 30s default
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
      await page.locator('#tab-btn-python').click();

      // set desugar state for this snippet
      const toggle = page.locator('#toggle-desugar');
      if (sn.desugar && !(await toggle.isChecked())) await toggle.check();
      if (!sn.desugar && (await toggle.isChecked())) await toggle.uncheck();

      await page.locator('#python-code').fill(sn.code);
      await page.locator('#btn-sync-to-blocks').click();
      await page.waitForTimeout(1000);

      // No lossy block that quotes raw source as a string literal.
      const lossy = await page.evaluate(() => {
        const ws = window.Blockly && window.Blockly.getMainWorkspace();
        if (!ws) return ['NO_WORKSPACE'];
        return ws.getAllBlocks()
          .filter((b) => b.type === 'text')
          .map((b) => b.getFieldValue('TEXT') || '')
          .filter((t) => /\bfor\b|range\(|^\s*[\[{]/.test(t));
      });
      expect(lossy).toEqual([]);

      // Execute
      await page.locator('#tab-btn-logs').click();
      await page.locator('#btn-run').click();
      await page.waitForFunction(() => {
        const t = document.querySelector('#console-logs')?.textContent || '';
        return t.includes('Execution completed') || t.includes('Runtime Error') || t.includes('Parser Error');
      }, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(800);

      const logs = await page.locator('#console-logs').textContent();
      expect(logs).not.toContain('[Parser Error]');
      expect(logs).not.toContain('[Runtime Error]');
      for (const want of sn.expectedStdout) {
        expect(logs).toContain(want);
      }
    });
  }
});
