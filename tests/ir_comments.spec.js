const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

test.describe('comment extraction (browser)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(220000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__pyodide && window.BlockPyAstBridge && window.BlockPyIR,
      null, { timeout: 180000 });
  });

  test('pythonToIR attaches leading/trailing/after comments to stmt nodes', async ({ page }) => {
    const ir = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = [
        '# header',
        'import os  # std',
        'def f():',
        '    # body',
        '    x = 1  # one',
        '    # tail',
        'y = 2',
      ].join('\n');
      return window.BlockPyAstBridge.pythonToIR(py, src);
    });
    const imp = ir.body[0];                 // Import
    const fn = ir.body[1];                   // FunctionDef
    const y = ir.body[2];                    // Assign y = 2
    expect(imp._comments.leading).toEqual(['# header']);
    expect(imp._comments.trailing).toBe('# std');
    const xStmt = fn.body[0];                // x = 1
    expect(xStmt._comments.leading).toEqual(['# body']);
    expect(xStmt._comments.trailing).toBe('# one');
    expect(xStmt._comments.after).toEqual(['# tail']);   // dangling at end of body
    expect(y._comments).toBeUndefined();     // no comment on y
  });

  test('a comment-only module round-trips (no statement to anchor to)', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = ['# just a note', '# second line'].join('\n');
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const code = await window.BlockPyAstBridge.irToPython(py, ir);
      return { module: ir._comments, code };
    });
    expect(out.module).toEqual({ leading: ['# just a note', '# second line'] });
    expect(out.code).toBe('# just a note\n# second line');
  });

  test('trailing comment on a continuation line is preserved', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = 'x = (1 +\n     2)  # keep';
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const code = await window.BlockPyAstBridge.irToPython(py, ir);
      return code;
    });
    expect(out).toContain('# keep');   // Option 3: reformatted, but the comment survives
  });

  test('irToPython re-injects comments; python->IR->python round-trips them', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = [
        '# header',
        'import os  # std',
        '',
        'def f():',
        '    # body',
        '    x = 1  # one',
        '    return x',
        'y = 2  # last',
      ].join('\n');
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const code = await window.BlockPyAstBridge.irToPython(py, ir);
      return code;
    });
    // Option 3: blank lines may vanish, but every comment must survive at its position.
    expect(out).toContain('# header');
    expect(out).toContain('import os  # std');
    expect(out).toContain('    # body');           // indented inside the function body
    expect(out).toContain('    x = 1  # one');
    expect(out).toContain('y = 2  # last');
  });
});
