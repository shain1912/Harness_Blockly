// Regression for method_def: class methods / nested defs become real connectable
// blocks (not gray raw_statement), with byte-identical text round-trips.
const { test, expect } = require('@playwright/test');
const P = require('../src/utils/parser.js');

const APP_URL = 'http://localhost:3000';

// ---- Browser helpers (mirror tests/test_new_blocks.spec.js) ----
async function convertPythonToBlocks(page, code) {
  await page.goto(APP_URL);
  await page.locator('#tab-btn-python').click();
  await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
  await page.locator('#python-code').fill('');
  await page.locator('#python-code').fill(code);
  await page.waitForTimeout(150);
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(600);
  return await page.evaluate(() => window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type));
}
async function generatedPython(page) {
  return await page.evaluate(() => window.Blockly.Python.workspaceToCode(window.__blocklyWorkspace));
}

test.describe('method_def block definition', () => {
  test('block + generator are registered and emit a def from a serialized workspace', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => !!window.Blockly && !!window.__blocklyWorkspace, null, { timeout: 15000 });
    const out = await page.evaluate(() => {
      const defined = !!window.Blockly.Blocks['method_def'] && !!window.Blockly.Python['method_def'];
      const json = { blocks: { languageVersion: 0, blocks: [{
        type: 'method_def',
        fields: { DECORATORS: '', NAME: '__init__', PARAMS: 'self, name' },
        inputs: { BODY: { block: { type: 'raw_statement', fields: { STMT: 'self.name = name' } } } }
      }]}};
      window.Blockly.serialization.workspaces.load(json, window.__blocklyWorkspace);
      const code = window.Blockly.Python.workspaceToCode(window.__blocklyWorkspace);
      return { defined, code: code.trim() };
    });
    expect(out.defined).toBe(true);
    expect(out.code).toBe('def __init__(self, name):\n  self.name = name');
  });
});

test.describe('method_def routing (Node, astToBlockly JSON shape)', () => {
  const toBlocks = (code) => {
    const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
    return P.astToBlockly(ast);
  };
  // Walk every block in the serialized tree (next + nested inputs).
  const collect = (json) => {
    const out = [];
    const visit = (b) => {
      if (!b) return;
      out.push(b);
      if (b.inputs) for (const k of Object.keys(b.inputs)) {
        if (b.inputs[k] && b.inputs[k].block) visit(b.inputs[k].block);
      }
      if (b.next && b.next.block) visit(b.next.block);
    };
    (json.blocks.blocks || []).forEach(visit);
    return out;
  };

  test('class methods become method_def, not raw_statement', () => {
    const code = [
      'class Dog:',
      '    def __init__(self, name):',
      '        self.name = name',
      '    def bark(self):',
      '        return self.name + " says woof"',
      ''
    ].join('\n');
    const all = collect(toBlocks(code));
    const methods = all.filter(b => b.type === 'method_def');
    expect(methods.length).toBe(2);
    expect(methods.map(m => m.fields.NAME).sort()).toEqual(['__init__', 'bark']);
    expect(methods.find(m => m.fields.NAME === '__init__').fields.PARAMS).toBe('self, name');
    const rawDefs = all.filter(b => b.type === 'raw_statement' && /^\s*def /.test(b.fields.STMT || ''));
    expect(rawDefs.length).toBe(0);
  });

  test('nested function def becomes method_def', () => {
    const code = ['def outer():', '    def inner(x):', '        return x + 1', '    return inner(1)', ''].join('\n');
    const all = collect(toBlocks(code));
    expect(all.some(b => b.type === 'method_def' && b.fields.NAME === 'inner')).toBe(true);
  });

  test('decorated method preserves DECORATORS', () => {
    const code = ['class C:', '    @staticmethod', '    def f(x):', '        return x', ''].join('\n');
    const all = collect(toBlocks(code));
    const f = all.find(b => b.type === 'method_def' && b.fields.NAME === 'f');
    expect(f).toBeTruthy();
    expect(f.fields.DECORATORS).toBe('@staticmethod');
  });
});
