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

test('raise ... from <cause> without an exception fails loud (invalid Python, never silent)', () => {
  // A user can connect ir_raise's CAUSE input while leaving EXC empty; that is unroundtrippable
  // (`raise from x` is a SyntaxError), so block->IR must throw rather than emit invalid IR.
  const ws = { blocks: { languageVersion: 0, blocks: [
    { type: 'ir_raise', inputs: { CAUSE: { block: { type: 'ir_name', fields: { ID: 'c' } } } } }] } };
  expect(() => global.BlockPyIR.blocklyToIr(ws)).toThrow(/requires an exception/);
});

test('bare except* (TryStar handler without a type) fails loud (invalid Python, never silent)', () => {
  // `except*:` is a SyntaxError — except* always needs an exception type. A typeless handler
  // in an ir_trystar block must throw on block->IR, not emit unparse-invalid IR.
  const ws = { blocks: { languageVersion: 0, blocks: [
    { type: 'ir_trystar', extraState: { handlers: [{ type: false, name: null }] },
      inputs: { BODY: { block: { type: 'ir_pass' } },
        HBODY0: { block: { type: 'ir_pass' } } } }] } };
  expect(() => global.BlockPyIR.blocklyToIr(ws)).toThrow(/requires an exception type/);
});

test('handlerless try without a valid finally form fails loud (invalid Python, never silent)', () => {
  // A try with no except must be finally-only (non-empty finally, no else). A bare `try:` and
  // a `try...else` without except are SyntaxErrors, so block->IR must throw, not emit them.
  const bareTry = { blocks: { languageVersion: 0, blocks: [
    { type: 'ir_try', extraState: { handlers: [] },
      inputs: { BODY: { block: { type: 'ir_pass' } } } }] } };
  expect(() => global.BlockPyIR.blocklyToIr(bareTry)).toThrow(/must have a finally and no else/);
  const tryElseNoExcept = { blocks: { languageVersion: 0, blocks: [
    { type: 'ir_try', extraState: { handlers: [] },
      inputs: { BODY: { block: { type: 'ir_pass' } }, ELSE: { block: { type: 'ir_pass' } },
        FINALLY: { block: { type: 'ir_pass' } } } }] } };
  expect(() => global.BlockPyIR.blocklyToIr(tryElseNoExcept)).toThrow(/must have a finally and no else/);
});

test('PENDING (unimplemented) nodes fail loudly with policy status, never silently', () => {
  // Match is on the worklist (PENDING, #15) — converting it must throw an explicit error
  // naming the node and its policy, not produce a wrong/empty block.
  const mod = { type: 'Module', type_ignores: [],
    body: [{ type: 'Match', subject: { type: 'Name', id: 'x' }, cases: [] }] };
  expect(() => global.BlockPyIR.irToBlockly(mod)).toThrow(/Match \(policy=PENDING\)/);
});

test('ClassDef (bases + keyword + body) round-trips losslessly (IR -> Blockly -> IR)', () => {
  // A class carrying a base, a metaclass keyword, and a body member exercises the
  // variable-arity bases/keywords mutator plus the mandatory body suite.
  const IR = { type: 'Module', type_ignores: [], body: [{
    type: 'ClassDef', name: 'C',
    bases: [{ type: 'Name', id: 'Base' }],
    keywords: [{ type: 'keyword', arg: 'metaclass', value: { type: 'Name', id: 'Meta' } }],
    body: [{ type: 'Assign', targets: [{ type: 'Name', id: 'x' }],
      value: { type: 'Constant', value: 1 } }],
    decorator_list: [],
    type_params: [],
  }] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(IR));
  expect(back).toEqual(IR);
});

test('Import / ImportFrom round-trip losslessly incl. asname and relative level (IR -> Blockly -> IR)', () => {
  // alias is a HELPER (no block): names + asnames live in the NAMES field; ImportFrom also
  // carries module + relative-import level (encoded as leading dots in the MODULE field).
  const IR = { type: 'Module', type_ignores: [], body: [
    { type: 'Import', names: [
      { type: 'alias', name: 'os.path', asname: 'p' },
      { type: 'alias', name: 'sys', asname: null }] },
    { type: 'ImportFrom', module: 'pkg', level: 2, names: [
      { type: 'alias', name: 'a', asname: 'b' },
      { type: 'alias', name: 'c', asname: null }] },
    { type: 'ImportFrom', module: null, level: 1, names: [
      { type: 'alias', name: 'x', asname: null }] },
  ] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(IR));
  expect(back).toEqual(IR);
});

test('Try (typed+named + bare handler, else, finally) round-trips losslessly (IR -> Blockly -> IR)', () => {
  // ExceptHandler is a HELPER (no block): handlers live in the Try block's extraState +
  // TYPE<i>/HBODY<i> inputs. Its exception-class field is `_field_type` (bridge-remapped to
  // dodge the `type` discriminator collision). orelse/finalbody are optional stmt suites.
  const IR = { type: 'Module', type_ignores: [], body: [{
    type: 'Try',
    body: [{ type: 'Pass' }],
    handlers: [
      { type: 'ExceptHandler', _field_type: { type: 'Name', id: 'ValueError' },
        name: 'e', body: [{ type: 'Pass' }] },
      { type: 'ExceptHandler', _field_type: null, name: null, body: [{ type: 'Pass' }] },
    ],
    orelse: [{ type: 'Pass' }],
    finalbody: [{ type: 'Pass' }],
  }] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(IR));
  expect(back).toEqual(IR);
});

test('With (multi-item, with/without as) and Delete (multi-target) round-trip losslessly', () => {
  // withitem is a HELPER: items live in the With block's extraState + CTX<i>/VAR<i> inputs.
  const IR = { type: 'Module', type_ignores: [], body: [
    { type: 'With', items: [
      { type: 'withitem', context_expr: { type: 'Name', id: 'a' },
        optional_vars: { type: 'Name', id: 'x' } },
      { type: 'withitem', context_expr: { type: 'Name', id: 'b' }, optional_vars: null },
    ], body: [{ type: 'Pass' }] },
    { type: 'Delete', targets: [{ type: 'Name', id: 'x' }, { type: 'Name', id: 'y' }] },
  ] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(IR));
  expect(back).toEqual(IR);
});

test('IfExp (ternary) round-trips losslessly (IR -> Blockly -> IR)', () => {
  const IR = { type: 'Module', type_ignores: [], body: [{
    type: 'Assign', targets: [{ type: 'Name', id: 'r' }],
    value: { type: 'IfExp',
      test: { type: 'Name', id: 'c' },
      body: { type: 'Name', id: 'a' },
      orelse: { type: 'Name', id: 'b' } } }] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(IR));
  expect(back).toEqual(IR);
});

test('ListComp (multi-generator + multi-if) and DictComp round-trip losslessly', () => {
  // comprehension is a HELPER: each generator's target/iter are inputs, its `ifs` count and
  // is_async flag live in the block extraState gens fragment, IF<i>_<j> inputs per filter.
  const IR = { type: 'Module', type_ignores: [], body: [
    { type: 'Assign', targets: [{ type: 'Name', id: 'xs' }],
      value: { type: 'ListComp',
        elt: { type: 'Name', id: 'x' },
        generators: [
          { type: 'comprehension', target: { type: 'Name', id: 'x' },
            iter: { type: 'Name', id: 'a' },
            ifs: [{ type: 'Name', id: 'p' }, { type: 'Name', id: 'q' }], is_async: 0 },
          { type: 'comprehension', target: { type: 'Name', id: 'y' },
            iter: { type: 'Name', id: 'b' }, ifs: [], is_async: 0 },
        ] } },
    { type: 'Assign', targets: [{ type: 'Name', id: 'd' }],
      value: { type: 'DictComp',
        key: { type: 'Name', id: 'k' }, value: { type: 'Name', id: 'v' },
        generators: [
          { type: 'comprehension', target: { type: 'Name', id: 'k' },
            iter: { type: 'Name', id: 'pairs' }, ifs: [], is_async: 0 }] } },
  ] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(IR));
  expect(back).toEqual(IR);
});

test('async statements (AsyncFunctionDef/AsyncFor/AsyncWith) round-trip losslessly', () => {
  // Async-ness is encoded in the block type (ir_asyncfuncdef / ir_asyncfor / ir_asyncwith),
  // reusing the FunctionDef/For/With shapes.
  const fnArgs = { type: 'arguments', posonlyargs: [], args: [], vararg: null,
    kwonlyargs: [], kw_defaults: [], kwarg: null, defaults: [] };
  const IR = { type: 'Module', type_ignores: [], body: [{
    type: 'AsyncFunctionDef', name: 'f', args: fnArgs, decorator_list: [],
    returns: null, type_params: [], body: [
      { type: 'AsyncFor', target: { type: 'Name', id: 'x' }, iter: { type: 'Name', id: 'it' },
        body: [{ type: 'Pass' }], orelse: [] },
      { type: 'AsyncWith', items: [
        { type: 'withitem', context_expr: { type: 'Name', id: 'cm' },
          optional_vars: { type: 'Name', id: 'c' } }], body: [{ type: 'Pass' }] },
    ] }] };
  const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(IR));
  expect(back).toEqual(IR);
});

test('Await / Yield (bare + value) / YieldFrom / NamedExpr round-trip losslessly', () => {
  const expr = (e) => ({ type: 'Module', type_ignores: [],
    body: [{ type: 'Expr', value: e }] });
  const cases = [
    { type: 'Await', value: { type: 'Name', id: 'x' } },
    { type: 'Yield', value: null },
    { type: 'Yield', value: { type: 'Constant', value: 1 } },
    { type: 'YieldFrom', value: { type: 'Name', id: 'xs' } },
    { type: 'NamedExpr', target: { type: 'Name', id: 'n' }, value: { type: 'Constant', value: 5 } },
  ];
  for (const e of cases) {
    const IR = expr(e);
    const back = global.BlockPyIR.blocklyToIr(global.BlockPyIR.irToBlockly(IR));
    expect(back).toEqual(IR);
  }
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
