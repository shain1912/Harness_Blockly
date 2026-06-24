// Real-Blockly guard for the folded method-call block (ir_call method-mode with a RECV
// FieldVariable). Pure-node tests use the JSON directly and never exercise Blockly's
// mutator + variable-field save/restore — the classic place a field silently resets. This loads a
// folded `img.resize(2)` block, round-trips it through real Blockly save->load->save, and confirms
// the receiver variable + method survive. Auto-starts Vite (PORT-overridable); no backend needed.
const { test, expect } = require('@playwright/test');
const APP = process.env.APP_URL || ('http://localhost:' + (process.env.PORT || '3000'));

test('folded method-call (ir_call RECV variable) survives a real Blockly load->save->load', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(
    () => !!(window.__blocklyWorkspace && window.Blockly && window.Blockly.serialization && window.BlockPyIR),
    null, { timeout: 60000 },
  );

  const result = await page.evaluate(() => {
    const B = window.Blockly;
    const ws = window.__blocklyWorkspace;
    const state = {
      variables: [{ name: 'img', id: 'imgid' }],
      blocks: { languageVersion: 0, blocks: [
        { type: 'ir_exprstmt', inputs: { VALUE: { block: {
          type: 'ir_call',
          extraState: { nargs: 1, kw: [], funcName: null, method: 'resize' },
          fields: { RECV: { id: 'imgid' } },
          inputs: { ARG0: { block: { type: 'ir_const', fields: { VALUE: '2' } } } },
        } } } },
      ] },
    };
    ws.clear();
    B.serialization.workspaces.load(state, ws);
    const saved = B.serialization.workspaces.save(ws);        // mutator saveExtraState + field save
    ws.clear();
    B.serialization.workspaces.load(saved, ws);               // mutator loadExtraState + field restore
    const saved2 = B.serialization.workspaces.save(ws);
    const ir = window.BlockPyIR.blocklyToIr(saved2);
    return { func: ir.body[0].value.func, args: ir.body[0].value.args.map((a) => a.value) };
  });

  // receiver variable resolved back to `img` and the method survived the real Blockly cycle
  expect(result.func).toEqual({ type: 'Attribute', value: { type: 'Name', id: 'img' }, attr: 'resize' });
  expect(result.args).toEqual([2]);
});
