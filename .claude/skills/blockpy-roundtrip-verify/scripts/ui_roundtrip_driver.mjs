// BlockPy round-trip verification driver — drives the REAL app UI in a headless browser.
//
//   node ui_roundtrip_driver.mjs <snippetFile> <outDir> <label>
//
// Loads the app, types the Python snippet into the source editor, clicks Convert, switches
// to the block workspace, screenshots it, and reports: the regenerated Python, whether any
// gray raw_* fallback blocks appeared, the parser syntax status, and an order-independent
// round-trip check. Writes <outDir>/<label>.png and <outDir>/<label>.json, and prints a
// single "RESULT:<json>" line to stdout. Exit 0 == ok, 1 == failed, 2 == bad args.
//
// Requires the Vite dev server already running (default http://localhost:3000; override
// with the APP_URL env var, e.g. APP_URL=http://localhost:3001/).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const APP_URL = process.env.APP_URL || 'http://localhost:3000/';
const [snippetFile, outDir, label] = process.argv.slice(2);
if (!snippetFile || !outDir || !label) {
  console.error('usage: node ui_roundtrip_driver.mjs <snippetFile> <outDir> <label>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const code = readFileSync(snippetFile, 'utf8').replace(/\r\n/g, '\n');

// Order-independent round-trip check: top-level def/class blocks get hoisted relative to
// module-level statements (standalone blocks have no next-connection in this app), so an
// exact string match is too strict. Compare the multiset of per-line normalized tokens
// instead — every statement must survive, regardless of block ordering.
const lineMultiset = (s) =>
  (s || '')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').replace(/\s+/g, ''))
    .filter(Boolean)
    .sort();
const equivalent = (a, b) => {
  const x = lineMultiset(a), y = lineMultiset(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

const result = { label, input: code, ok: false, error: null };

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__blocklyWorkspace && window.BlockPyParser && window.Blockly && window.Blockly.Python,
    null, { timeout: 20000 }
  );

  // 1. Switch to the Python source editor and type the snippet via the real textarea.
  await page.click('#tab-btn-python');
  await page.fill('#python-code', code);

  // 2. Read the live parser syntax status (#syntax-status-text gets a .valid / .invalid class).
  await page.waitForTimeout(300);
  const syntaxStatus = await page.evaluate(() => {
    const el = document.querySelector('#syntax-status-text');
    return { valid: el?.classList.contains('valid') ?? false, text: (el?.textContent || '').trim() };
  });

  // 3. Convert Python -> blocks.
  await page.click('#btn-sync-to-blocks');
  await page.waitForTimeout(800);

  // 4. Switch to the block workspace, let it render/resize, and screenshot it.
  await page.click('#tab-btn-blockly');
  await page.waitForTimeout(800);
  const shot = join(outDir, `${label}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  // 5. Inspect the workspace: regenerated code + block-type inventory.
  const ws = await page.evaluate(() => {
    const w = window.__blocklyWorkspace;
    return {
      code: window.Blockly.Python.workspaceToCode(w),
      types: w.getAllBlocks(false).map((b) => b.type),
    };
  });

  const rawBlocks = ws.types.filter((t) => t === 'raw_statement' || t === 'raw_expression');
  const blockCount = ws.types.length;
  const roundTripEquivalent = equivalent(ws.code, code);

  Object.assign(result, {
    ok: syntaxStatus.valid && blockCount > 0 && rawBlocks.length === 0 && roundTripEquivalent,
    syntaxValid: syntaxStatus.valid,
    syntaxText: syntaxStatus.text,
    regenerated: ws.code,
    blockTypes: [...new Set(ws.types)],
    blockCount,
    rawBlockCount: rawBlocks.length,
    roundTripEquivalent,
    consoleErrors: consoleErrors.slice(0, 5),
    screenshot: shot,
  });
} catch (e) {
  result.error = String(e.message || e);
} finally {
  await browser.close();
}

writeFileSync(join(outDir, `${label}.json`), JSON.stringify(result, null, 2));
console.log('RESULT:' + JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
