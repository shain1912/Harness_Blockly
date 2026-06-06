// [Phase 1, 1.3] registerAiBlocks turns an AI /api/ai-abstract response into real blocks:
// plain call blocks (func/args/hasOutput) register via registerBlock (sound by form), and
// any macro block (pythonTemplate) goes through the oracle-gated synthesizeBlocks. Tested
// with a fixture AI response (deterministic — no live LLM). Targets the dev server on :3000.
const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:3000/';

test('registerAiBlocks registers call blocks (respecting hasOutput) and gates macros', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__blockpyEngine && window.BlockPyParser && window.Blockly,
    null, { timeout: 15000 }
  );
  const out = await page.evaluate(() => {
    const eng = window.__blockpyEngine;
    const blocks = [
      { func: 'connect', args: ['host', 'port'], hasOutput: true, colour: '#123456', title: 'net.connect' },
      { func: 'send', args: ['data'], hasOutput: false, title: 'net.send' },
      // a macro block whose template is unrepresentable -> must be rejected by the oracle gate
      { type: 'macro_net_bad', name: 'Bad', slots: [{ id: 'v', label: 'V', type: 'value', default: 'x' }], pythonTemplate: 'match {v}:\n    case 1:\n        pass' },
    ];
    const r = eng.registerAiBlocks('net', blocks);
    return {
      registered: r.registered,
      rejected: r.rejected.map(x => x.type || x),
      connectExists: !!window.Blockly.Blocks['lib_net_connect'],
      sendStmtExists: !!window.Blockly.Blocks['lib_net_send_stmt'],
      badExists: !!window.Blockly.Blocks['macro_net_bad'],
    };
  });
  expect(out.connectExists).toBe(true);   // hasOutput:true -> value block
  expect(out.sendStmtExists).toBe(true);  // hasOutput:false -> _stmt block
  expect(out.registered).toContain('lib_net_connect');
  expect(out.registered).toContain('lib_net_send_stmt');
  expect(out.badExists).toBe(false);      // hallucinated macro rejected by oracle
  expect(out.rejected).toContain('macro_net_bad');
});
