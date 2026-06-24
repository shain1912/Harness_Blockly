// Block-UX pass (user feedback): (1) a real rounded STRING block — strings render as ir_str you
// type into (no JSON quotes), not ir_const; (2) a module-rooted call folds into ONE ir_call
// command block (funcName = dotted label) instead of an ir_attribute plugged into the call
// ("3 overlapping blocks"). Variable-method calls (editable receiver) stay nested. Pure-node.
const { test, expect } = require('@playwright/test');
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');
const IR = global.BlockPyIR;

const mod = (body) => ({ type: 'Module', body, type_ignores: [] });
const imp = { type: 'Import', names: [{ name: 'cv2', asname: null }] };
const call = (func, args) => ({ type: 'Call', func, args, keywords: [] });
const attr = (v, a) => ({ type: 'Attribute', value: v, attr: a });
const name = (id) => ({ type: 'Name', id });
const con = (v) => ({ type: 'Constant', value: v });
const expr = (v) => ({ type: 'Expr', value: v });
const toBlocks = (ir) => IR.irToBlockly(ir).blocks.blocks;
function findType(blocks, type) {
  const out = [];
  const walk = (b) => {
    if (!b) return;
    if (b.type === type) out.push(b);
    for (const k of Object.keys(b.inputs || {})) { walk(b.inputs[k].block); walk(b.inputs[k].shadow); }
    if (b.next) walk(b.next.block);
  };
  blocks.forEach(walk);
  return out;
}

test('string Constant -> ir_str (rounded string block); number -> ir_const', () => {
  const blocks = toBlocks(mod([expr(con('hello')), expr(con(5))]));
  const strs = findType(blocks, 'ir_str');
  const consts = findType(blocks, 'ir_const');
  expect(strs.length).toBe(1);
  expect(strs[0].fields.TEXT).toBe('hello');     // raw text, no quotes
  expect(consts.length).toBe(1);
  expect(consts[0].fields.VALUE).toBe('5');
});

test('ir_str round-trips to a string Constant (type the content, no quotes)', () => {
  const ir = IR.blocklyToIr({ blocks: { languageVersion: 0, blocks: [
    { type: 'ir_exprstmt', inputs: { VALUE: { block: { type: 'ir_str', fields: { TEXT: 'gray' } } } } },
  ] } });
  expect(ir.body[0].value).toEqual({ type: 'Constant', value: 'gray' });
});

test('module-rooted call folds into ONE ir_call (funcName dotted, no nested attribute block)', () => {
  const blocks = toBlocks(mod([imp, expr(call(attr(name('cv2'), 'imread'), [con('x.png')]))]));
  const calls = findType(blocks, 'ir_call');
  expect(calls.length).toBe(1);
  expect(calls[0].extraState.funcName).toBe('cv2.imread');
  expect(calls[0].inputs.FUNC).toBeUndefined();
  expect(findType(blocks, 'ir_attribute').length).toBe(0);   // no separate attribute block
});

test('folded module call round-trips losslessly', () => {
  const ws = IR.irToBlockly(mod([imp, expr(call(attr(name('cv2'), 'waitKey'), [con(1000)]))]));
  const ir1 = IR.blocklyToIr(ws);
  const c = ir1.body[1].value;
  expect(c.type).toBe('Call');
  expect(c.func).toEqual({ type: 'Attribute', value: { type: 'Name', id: 'cv2' }, attr: 'waitKey' });
  expect(c.args[0].value).toBe(1000);
});

test('variable-method call folds into ONE ir_call (receiver = native variable dropdown)', () => {
  const blocks = toBlocks(mod([expr(call(attr(name('img'), 'resize'), [con(2)]))]));
  const c = findType(blocks, 'ir_call')[0];
  expect(c.extraState.method).toBe('resize');
  expect(c.fields.RECV).toEqual({ id: 'img' });
  expect(c.extraState.funcName).toBeNull();
  expect(findType(blocks, 'ir_attribute').length).toBe(0);   // no separate attribute block
});

test('folded variable-method call round-trips to receiver.method(...)', () => {
  const ws = IR.irToBlockly(mod([expr(call(attr(name('img'), 'resize'), [con(2)]))]));
  const c = IR.blocklyToIr(ws).body[0].value;
  expect(c.type).toBe('Call');
  expect(c.func).toEqual({ type: 'Attribute', value: { type: 'Name', id: 'img' }, attr: 'resize' });
  expect(c.args[0].value).toBe(2);
});

test('complex receiver (a.b.method) stays a FUNC input (not folded)', () => {
  // receiver a.b is an Attribute, not a plain variable -> keep the value input
  const blocks = toBlocks(mod([expr(call(attr(attr(name('a'), 'b'), 'method'), []))]));
  const c = findType(blocks, 'ir_call')[0];
  expect(c.extraState.method).toBeNull();
  expect(c.extraState.funcName).toBeNull();
  expect(c.inputs.FUNC).toBeDefined();
});

test('plain-name call is still a single command block (unchanged)', () => {
  const blocks = toBlocks(mod([expr(call(name('print'), [con('hi')]))]));
  expect(findType(blocks, 'ir_call')[0].extraState.funcName).toBe('print');
});

test('a call statement is ONE rectangular stack block (no exprstmt wrapper + rounded call)', () => {
  const blocks = toBlocks(mod([expr(call(name('print'), [con('hi')]))]));
  expect(blocks.length).toBe(1);
  expect(blocks[0].type).toBe('ir_call');           // the statement IS the call
  expect(blocks[0].extraState.stmt).toBe(true);      // stack (statement) shape, not a reporter
  expect(findType(blocks, 'ir_exprstmt').length).toBe(0);
});

test('a call used as a VALUE stays a reporter (no stmt flag)', () => {
  // x = len(s)  ->  the call is in a value position, rounded
  const blocks = toBlocks(mod([{ type: 'Assign', targets: [name('x')], value: call(name('len'), [name('s')]) }]));
  const c = findType(blocks, 'ir_call')[0];
  expect(c.extraState.stmt).toBeFalsy();
});

test('statement-call round-trips to Expr(Call)', () => {
  const ws = IR.irToBlockly(mod([expr(call(name('print'), [con('hi')]))]));
  const ir = IR.blocklyToIr(ws);
  expect(ir.body[0].type).toBe('Expr');
  expect(ir.body[0].value.type).toBe('Call');
  expect(ir.body[0].value.func).toEqual({ type: 'Name', id: 'print' });
});
