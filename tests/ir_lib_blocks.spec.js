const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

// ── Node-level (no browser) ─────────────────────────────────────────────────
require('../src/utils/libRegistry.js');
const REG = global.BlockPyLibRegistry;

test.describe('lib registry (node)', () => {
  test.beforeEach(() => REG.clearAll());

  test('registers a valid module.func spec and computes the block type', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    expect(res.ok).toBe(true);
    expect(res.type).toBe('lib_cv2_imread');
    expect(REG.getLibSpec('lib_cv2_imread')).toMatchObject({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
  });

  test('statement-form spec gets the _stmt suffix', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: 'imshow', argNames: ['winname', 'mat'], hasOutput: false });
    expect(res.type).toBe('lib_cv2_imshow_stmt');
  });

  test('rejects an invalid func identifier (oracle static check)', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: '2bad', argNames: [], hasOutput: true });
    expect(res.ok).toBe(false);
    expect(REG.getLibSpec('lib_cv2_2bad')).toBeUndefined();
  });

  test('rejects duplicate arg names', () => {
    const res = REG.registerLibBlock({ module: 'm', func: 'f', argNames: ['a', 'a'], hasOutput: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('duplicate');
  });

  test('listLibBlocks groups by module', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['f'], hasOutput: true });
    REG.registerLibBlock({ module: 'cv2', func: 'waitKey', argNames: ['d'], hasOutput: true });
    REG.registerLibBlock({ module: 'math', func: 'sqrt', argNames: ['x'], hasOutput: true });
    const groups = REG.listLibBlocks();
    const cv2 = groups.find((g) => g.module === 'cv2');
    expect(cv2.blocks.map((b) => b.type).sort()).toEqual(['lib_cv2_imread', 'lib_cv2_waitKey']);
    expect(cv2.blocks[0]).toHaveProperty('argNames');
  });

  test('re-registering an existing type is idempotent (no Map/visual divergence)', () => {
    const a = REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    expect(a.ok).toBe(true);
    const b = REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['p1', 'p2', 'p3'], hasOutput: true });
    expect(b).toEqual({ ok: true, type: 'lib_cv2_imread' });          // no-op success
    expect(REG.getLibSpec('lib_cv2_imread').argNames).toEqual(['filename']);  // first registration wins
  });
});

// ── lib lower hook (node) ───────────────────────────────────────────────────
require('../src/utils/irToBlockly.js');   // BlockPyIR.renderComments (used by blocklyToIr)
require('../src/utils/blocklyToIr.js');
const IR = global.BlockPyIR;

test.describe('lib lower hook (node)', () => {
  test.beforeEach(() => REG.clearAll());

  test('output-form lib block lowers to module.func Call IR (as a bare Expr at top level)', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'lib_cv2_imread', inputs: { ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"x"' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body).toHaveLength(1);
    expect(ir.body[0]).toMatchObject({
      type: 'Expr',
      value: {
        type: 'Call',
        func: { type: 'Attribute', attr: 'imread', value: { type: 'Name', id: 'cv2' } },
        args: [{ type: 'Constant', value: 'x' }],
        keywords: [],
      },
    });
  });

  test('statement-form lib block lowers to a bare-call Expr', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imshow', argNames: ['winname', 'mat'], hasOutput: false });
    const ws = { blocks: { blocks: [
      { type: 'lib_cv2_imshow_stmt', inputs: {
        ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"win"' } } },
        ARG1: { shadow: { type: 'ir_name', fields: { ID: 'img' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0]).toMatchObject({ type: 'Expr', value: { type: 'Call', func: { attr: 'imshow' } } });
    expect(ir.body[0].value.args).toHaveLength(2);
  });

  test('bare-func (no module) lib block lowers to Name-call', () => {
    REG.registerLibBlock({ module: '', func: 'helper', argNames: ['x'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'lib__helper', inputs: { ARG0: { shadow: { type: 'ir_name', fields: { ID: 'v' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value.func).toMatchObject({ type: 'Name', id: 'helper' });
  });

  test('lib block as an ARG of a real ir_call lowers to a bare Call (no Expr wrap)', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'ir_call', extraState: { nargs: 1, kw: [] }, inputs: {
        FUNC: { shadow: { type: 'ir_name', fields: { ID: 'print' } } },
        ARG0: { block: { type: 'lib_cv2_imread', inputs: { ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"x"' } } } } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value.args[0]).toMatchObject({ type: 'Call', func: { attr: 'imread' } });
  });

  test('a truly unknown block type still throws (no silent swallow)', () => {
    const ws = { blocks: { blocks: [{ type: 'totally_unknown_block' }] } };
    expect(() => IR.blocklyToIr(ws)).toThrow(/no stmt handler for totally_unknown_block/);
  });
});
