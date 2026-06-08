const { test, expect } = require('@playwright/test');

// Pure-Node unit tests for the IR <-> Blockly mapping layer (no browser / Pyodide).
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');

const IR = {
  type: 'Module',
  type_ignores: [],
  body: [
    { type: 'Assign', targets: [{ type: 'Name', id: 'x' }],
      value: { type: 'Constant', value: 1 } },
  ],
};

test('IR -> Blockly -> IR is identity for x = 1', () => {
  const bj = global.BlockPyIR.irToBlockly(IR);
  const back = global.BlockPyIR.blocklyToIr(bj);
  expect(back).toEqual(IR);
});

test('IR -> Blockly produces a loadable ir_assign workspace shape', () => {
  const bj = global.BlockPyIR.irToBlockly(IR);
  const a = bj.blocks.blocks[0];
  expect(a.type).toBe('ir_assign');
  expect(a.extraState.n).toBe(1);
  expect(a.inputs.TARGET0.block.type).toBe('ir_name');
  expect(a.inputs.TARGET0.block.fields.ID).toBe('x');
  expect(a.inputs.VALUE.block.type).toBe('ir_const');
});

test('chained assignment (a = b = 1) round-trips losslessly', () => {
  const ir = { type: 'Module', type_ignores: [], body: [
    { type: 'Assign',
      targets: [{ type: 'Name', id: 'a' }, { type: 'Name', id: 'b' }],
      value: { type: 'Constant', value: 1 } },
  ] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(ir));
  expect(back).toEqual(ir);
});

test('multiple statements chain via next and round-trip', () => {
  const ir2 = { type: 'Module', type_ignores: [], body: [
    { type: 'Assign', targets: [{ type: 'Name', id: 'x' }], value: { type: 'Constant', value: 1 } },
    { type: 'Assign', targets: [{ type: 'Name', id: 'y' }], value: { type: 'Constant', value: 2 } },
  ] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(ir2));
  expect(back).toEqual(ir2);
});

test('empty set has no literal: ir_set min-arity 1, and Set([]) fails loud', () => {
  // A fresh ir_set block must not default to n=0 (which would unparse to "{*()}").
  // We assert the converter rejects an empty Set IR rather than emit unroundtrippable code.
  const mod = { type: 'Module', type_ignores: [], body: [
    { type: 'Assign', targets: [{ type: 'Name', id: 's' }], value: { type: 'Set', elts: [] } }] };
  expect(() => global.BlockPyIR.irToBlockly(mod)).toThrow(/empty Set/);
});

test('empty mandatory body synthesizes pass (block->IR stays valid Python)', () => {
  // An ir_if with an empty BODY (user dragged an if with nothing inside) must become
  // If(body=[Pass]) so it unparses to valid `if x: pass`, not an empty suite.
  const ws = { blocks: { languageVersion: 0, blocks: [
    { type: 'ir_if', inputs: { TEST: { block: { type: 'ir_name', fields: { ID: 'x' } } } } }] } };
  const ir = global.BlockPyIR.blocklyToIr(ws);
  expect(ir.body[0].type).toBe('If');
  expect(ir.body[0].body).toEqual([{ type: 'Pass' }]);
  expect(ir.body[0].orelse).toEqual([]);
});

test('PENDING (unimplemented) nodes fail loudly with policy status, never silently', () => {
  // Delete is on the worklist (PENDING) — converting it must throw an explicit error
  // naming the node and its policy, not produce a wrong/empty block.
  const mod = { type: 'Module', type_ignores: [],
    body: [{ type: 'Delete', targets: [{ type: 'Name', id: 'x' }] }] };
  expect(() => global.BlockPyIR.irToBlockly(mod)).toThrow(/Delete \(policy=PENDING\)/);
});

test('multiple disconnected top-level stacks are all converted (none dropped)', () => {
  // Simulate a saved workspace with TWO separate top-level stacks.
  const stack = (id) => ({ type: 'ir_assign', extraState: { n: 1 },
    inputs: { TARGET0: { block: { type: 'ir_name', fields: { ID: id } } },
              VALUE: { block: { type: 'ir_const', fields: { VALUE: '1' } } } } });
  const ws = { blocks: { languageVersion: 0, blocks: [stack('x'), stack('y')] } };
  const ir = global.BlockPyIR.blocklyToIr(ws);
  expect(ir.body.map((s) => s.targets[0].id)).toEqual(['x', 'y']);
});
