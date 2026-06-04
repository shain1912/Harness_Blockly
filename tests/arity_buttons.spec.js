// Regression for MakeCode-style +/- arity buttons on dynamic value-input blocks.
// Buttons' onClick only calls block.changeArity_(±1), so tests drive that method
// directly (robust vs simulating pixel clicks on the SVG field).
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

async function bootWorkspace(page) {
  await page.goto(APP_URL);
  await page.waitForFunction(() => !!window.Blockly && !!window.__blocklyWorkspace, null, { timeout: 15000 });
  // The app auto-loads a demo on mount and syncs it to blocks via a deferred timer. Wait
  // for that initial sync to settle (workspace non-empty) so it cannot overwrite the test
  // block we load next. Without this, newBlock()'s ws.clear() races the demo timer.
  await page.waitForFunction(() => window.__blocklyWorkspace.getAllBlocks(false).length > 0, null, { timeout: 15000 });
}

// Load a single block (optionally with extraState) and return an in-page handle id.
async function newBlock(page, type, extraState) {
  return await page.evaluate(({ type, extraState }) => {
    const ws = window.__blocklyWorkspace;
    ws.clear();
    const json = { blocks: { languageVersion: 0, blocks: [Object.assign({ type }, extraState ? { extraState } : {})] } };
    window.Blockly.serialization.workspaces.load(json, ws);
    return ws.getTopBlocks(false)[0].id;
  }, { type, extraState });
}

test.describe('arity +/- buttons', () => {
  test('changeArity_(+1) adds a slot and the PLUS field exists', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 1 });
    const r = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      const before = b.itemCount_;
      b.changeArity_(1);
      return { before, after: b.itemCount_, hasArg1: !!b.getInput('ARG1'), hasPlus: !!b.getField('PLUS') };
    }, id);
    expect(r.before).toBe(1);
    expect(r.after).toBe(2);
    expect(r.hasArg1).toBe(true);
    expect(r.hasPlus).toBe(true);
  });

  test('changeArity_(-1) removes the last slot', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 2 });
    const r = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      b.changeArity_(-1);
      return { after: b.itemCount_, hasArg1: !!b.getInput('ARG1') };
    }, id);
    expect(r.after).toBe(1);
    expect(r.hasArg1).toBe(false);
  });

  test('min guard: func_call cannot go below 0 and MINUS hidden at min', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 0 });
    const r = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      const hasMinusAtMin = !!b.getField('MINUS');
      b.changeArity_(-1);
      return { after: b.itemCount_, hasMinusAtMin };
    }, id);
    expect(r.after).toBe(0);
    expect(r.hasMinusAtMin).toBe(false);
  });

  test('print_multi min is 1', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'print_multi', { itemCount: 1 });
    const after = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      b.changeArity_(-1);
      return b.itemCount_;
    }, id);
    expect(after).toBe(1);
  });

  test('child connection on ARG0 is preserved across +1', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 1 });
    const stillConnected = await page.evaluate((id) => {
      const ws = window.__blocklyWorkspace;
      const b = ws.getBlockById(id);
      const child = ws.newBlock('text');
      child.initSvg && child.initSvg();
      b.getInput('ARG0').connection.connect(child.outputConnection);
      const childId = child.id;
      b.changeArity_(1);
      const c = b.getInput('ARG0').connection.targetBlock();
      return !!c && c.id === childId;
    }, id);
    expect(stillConnected).toBe(true);
  });

  test('itemCount persists through save/load', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 1 });
    const saved = await page.evaluate((id) => {
      const ws = window.__blocklyWorkspace;
      ws.getBlockById(id).changeArity_(1);
      const state = window.Blockly.serialization.workspaces.save(ws);
      return state.blocks.blocks[0].extraState.itemCount;
    }, id);
    expect(saved).toBe(2);
  });
});
