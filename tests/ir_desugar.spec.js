const { test, expect } = require('@playwright/test');

// Pure-Node unit tests for the Phase 4 desugar-as-feature pass (no browser / Pyodide).
// desugarIr is an optional IR->IR rewrite: SUGAR (chained Compare, ternary IfExp,
// comprehensions) -> elementary BoolOp/If/For/Assign/Call IR, ONLY in provably-eager
// positions; SUGAR is preserved everywhere else. See
// DOCS/superpowers/specs/2026-06-19-desugar-as-feature-design.md.
const Desugar = require('../src/utils/irDesugar.js');
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');
const IRB = global.BlockPyIR;

// ---- tiny IR builders (CPython-3.12 ast JSON shape; ctx/_loc omitted, unparse ignores them) ----
const Name = (id) => ({ type: 'Name', id, ctx: { type: 'Load' } });
const Const = (v) => ({ type: 'Constant', value: v });
const Attr = (value, attr) => ({ type: 'Attribute', value, attr, ctx: { type: 'Load' } });
const Call = (func, args = []) => ({ type: 'Call', func, args, keywords: [] });
const Compare = (left, ops, comparators) => ({ type: 'Compare', left, ops: ops.map((o) => ({ type: o })), comparators });
const IfExp = (test, body, orelse) => ({ type: 'IfExp', test, body, orelse });
const BoolOp = (op, values) => ({ type: 'BoolOp', op: { type: op }, values });
const Assign = (id, value) => ({ type: 'Assign', targets: [Name(id)], value });
const Expr = (value) => ({ type: 'Expr', value });
const Module = (...body) => ({ type: 'Module', type_ignores: [], body });

const run = (mod) => Desugar.desugarIr(mod);

// =========================== chained comparison ============================

test('chained compare with pure middle: a < b < c -> (a < b) and (b < c)', () => {
  const out = run(Module(Expr(Compare(Name('a'), ['Lt', 'Lt'], [Name('b'), Name('c')]))));
  const v = out.body[0].value;
  expect(v.type).toBe('BoolOp');
  expect(v.op.type).toBe('And');
  expect(v.values.length).toBe(2);
  expect(v.values[0].type).toBe('Compare');
  expect(v.values[0].left.id).toBe('a');
  expect(v.values[0].ops[0].type).toBe('Lt');
  expect(v.values[0].comparators[0].id).toBe('b');
  expect(v.values[1].left.id).toBe('b');
  expect(v.values[1].comparators[0].id).toBe('c');
});

test('triple chain a < b <= c < d -> three And-ed pairs', () => {
  const out = run(Module(Expr(Compare(Name('a'), ['Lt', 'LtE', 'Lt'], [Name('b'), Name('c'), Name('d')]))));
  const v = out.body[0].value;
  expect(v.type).toBe('BoolOp');
  expect(v.values.map((p) => [p.left.id, p.ops[0].type, p.comparators[0].id]))
    .toEqual([['a', 'Lt', 'b'], ['b', 'LtE', 'c'], ['c', 'Lt', 'd']]);
});

test('constant/attribute middles count as pure: 0 < self.x < 10 desugars', () => {
  const out = run(Module(Expr(Compare(Const(0), ['Lt', 'Lt'], [Attr(Name('self'), 'x'), Const(10)]))));
  expect(out.body[0].value.type).toBe('BoolOp');
});

test('chained compare is safe in a lazy slot too (pure->pure): y and (a < b < c) still desugars', () => {
  const out = run(Module(Assign('z', BoolOp('And', [Name('y'), Compare(Name('a'), ['Lt', 'Lt'], [Name('b'), Name('c')])]))));
  // top BoolOp preserved; the chained compare inside (even in a lazy slot) becomes a nested BoolOp(And).
  const top = out.body[0].value;
  expect(top.type).toBe('BoolOp');
  expect(top.values[1].type).toBe('BoolOp');
  expect(top.values[1].op.type).toBe('And');
});

test('PRESERVE: single-op compare a < b is left as a Compare', () => {
  const out = run(Module(Expr(Compare(Name('a'), ['Lt'], [Name('b')]))));
  expect(out.body[0].value.type).toBe('Compare');
  expect(out.body[0].value.ops.length).toBe(1);
});

test('PRESERVE: non-pure middle a < f() < b stays a chained Compare (duplicating would double-call f)', () => {
  const out = run(Module(Expr(Compare(Name('a'), ['Lt', 'Lt'], [Call(Name('f')), Name('b')]))));
  const v = out.body[0].value;
  expect(v.type).toBe('Compare');
  expect(v.ops.length).toBe(2);
});

// ACCEPTED NIT (Pragmatic, 2026-06-22): a chained compare with a variable (Name) middle desugars to
// the clean `a and b` form even though the middle is duplicated. This is non-equivalent ONLY for the
// pathological case of an overloaded comparison operator that mutates the middle's binding between
// the two reads — not normal Python. Locks the clean-output decision.
test('ACCEPTED: variable-middle chained compare desugars to clean BoolOp(And) (pragmatic)', () => {
  const out = run(Module(Expr(Compare(Name('a'), ['Lt', 'Lt'], [Name('b'), Name('c')]))));
  const v = out.body[0].value;
  expect(v.type).toBe('BoolOp');
  expect(v.values[0].comparators[0].id).toBe('b');   // middle duplicated into both pairs (accepted)
  expect(v.values[1].left.id).toBe('b');
});

// =============================== ternary ==================================

test('ternary in Assign value hoists an If + temp: t = a if c else b', () => {
  const out = run(Module(Assign('t', IfExp(Name('c'), Name('a'), Name('b')))));
  expect(out.body.length).toBe(2);                 // hoisted If, then the rewritten assign
  const ifs = out.body[0];
  expect(ifs.type).toBe('If');
  expect(ifs.test.id).toBe('c');
  expect(ifs.body.length).toBe(1);
  expect(ifs.body[0].type).toBe('Assign');
  expect(ifs.body[0].value.id).toBe('a');
  expect(ifs.orelse[0].type).toBe('Assign');
  expect(ifs.orelse[0].value.id).toBe('b');
  // both branches assign the SAME temp, and the assign now reads it
  const tmp = ifs.body[0].targets[0].id;
  expect(ifs.orelse[0].targets[0].id).toBe(tmp);
  const assign = out.body[1];
  expect(assign.type).toBe('Assign');
  expect(assign.targets[0].id).toBe('t');
  expect(assign.value).toEqual(Name(tmp));
});

test('ternary needs NO None pre-init (both branches assign the temp)', () => {
  const out = run(Module(Assign('t', IfExp(Name('c'), Name('a'), Name('b')))));
  // exactly [If, Assign] — no leading "_t = None"
  expect(out.body.map((s) => s.type)).toEqual(['If', 'Assign']);
});

test('PRESERVE: ternary in a lazy BoolOp slot is kept as IfExp', () => {
  const out = run(Module(Assign('z', BoolOp('And', [Name('y'), IfExp(Name('c'), Name('a'), Name('b'))]))));
  const top = out.body[0].value;
  expect(out.body.length).toBe(1);                 // nothing hoisted
  expect(top.type).toBe('BoolOp');
  expect(top.values[1].type).toBe('IfExp');
});

// =========================== totality / purity ============================

test('desugarIr does not mutate its input', () => {
  const input = Module(Assign('t', IfExp(Name('c'), Name('a'), Name('b'))));
  const snapshot = JSON.stringify(input);
  run(input);
  expect(JSON.stringify(input)).toBe(snapshot);
});

test('non-Module input is returned unchanged (defensive/total)', () => {
  const weird = { type: 'NotAModule' };
  expect(run(weird)).toBe(weird);
});

// ============================ comprehensions ===============================

const BinOp = (left, op, right) => ({ type: 'BinOp', left, op: { type: op }, right });
const Gen = (target, iter, ifs = [], is_async = 0) => ({ type: 'comprehension', target, iter, ifs, is_async });
const ListComp = (elt, generators) => ({ type: 'ListComp', elt, generators });
const SetComp = (elt, generators) => ({ type: 'SetComp', elt, generators });
const DictComp = (key, value, generators) => ({ type: 'DictComp', key, value, generators });
const GenExp = (elt, generators) => ({ type: 'GeneratorExp', elt, generators });
const For = (target, iter, body, orelse = []) => ({ type: 'For', target, iter, body, orelse, type_comment: null });
const rng = (n) => Call(Name('range'), [Const(n)]);

test('list comprehension -> init [] + for + append, value becomes the accumulator', () => {
  const out = run(Module(Assign('squares', ListComp(BinOp(Name('i'), 'Mult', Name('i')), [Gen(Name('i'), rng(5))]))));
  expect(out.body.length).toBe(3);
  const [init, loop, assign] = out.body;
  expect(init.type).toBe('Assign');
  expect(init.value.type).toBe('List');
  expect(init.value.elts).toEqual([]);
  const acc = init.targets[0].id;
  expect(acc.startsWith('_bp_acc_')).toBe(true);
  expect(loop.type).toBe('For');
  expect(loop.target.id).toBe('i');
  expect(loop.iter.type).toBe('Call');
  expect(loop.orelse).toEqual([]);
  expect(loop.body.length).toBe(1);
  const call = loop.body[0];
  expect(call.type).toBe('Expr');
  expect(call.value.type).toBe('Call');
  expect(call.value.func.type).toBe('Attribute');
  expect(call.value.func.attr).toBe('append');
  expect(call.value.func.value.id).toBe(acc);
  expect(call.value.args[0].type).toBe('BinOp');
  expect(assign.type).toBe('Assign');
  expect(assign.targets[0].id).toBe('squares');
  expect(assign.value.id).toBe(acc);
});

test('set comprehension -> init set() + for + add', () => {
  const out = run(Module(Assign('s', SetComp(Name('x'), [Gen(Name('x'), Name('xs'))]))));
  const [init, loop] = out.body;
  expect(init.value.type).toBe('Call');           // set()
  expect(init.value.func.id).toBe('set');
  expect(init.value.args).toEqual([]);
  expect(loop.body[0].value.func.attr).toBe('add');
});

test('dict comprehension -> {} + for + (key temp THEN acc[key_temp] = value)', () => {
  // Bare `acc[key] = value` would evaluate value before key (Python store-subscript order),
  // reversing the dict comp's key-before-value order. So key is hoisted into a temp first.
  const out = run(Module(Assign('d', DictComp(Name('k'), Name('v'), [Gen(Name('k'), Name('ks'))]))));
  const [init, loop] = out.body;
  expect(init.value.type).toBe('Dict');
  expect(init.value.keys).toEqual([]);
  const acc = init.targets[0].id;
  expect(loop.body.length).toBe(2);
  const keyAssign = loop.body[0];
  const storeAssign = loop.body[1];
  expect(keyAssign.type).toBe('Assign');          // _k = key  (key evaluated first)
  expect(keyAssign.value.id).toBe('k');
  const kt = keyAssign.targets[0].id;
  expect(kt.startsWith('_bp_key_')).toBe(true);
  expect(storeAssign.type).toBe('Assign');        // acc[_k] = value
  expect(storeAssign.targets[0].type).toBe('Subscript');
  expect(storeAssign.targets[0].value.id).toBe(acc);
  expect(storeAssign.targets[0].slice.id).toBe(kt);
  expect(storeAssign.value.id).toBe('v');
});

// ----- order preservation: hoisting must not reorder side effects (adversarial findings) -----

test('PRESERVE: z = f() + [comp] — comp after a side-effecting expr is NOT hoisted', () => {
  const out = run(Module(Assign('z', BinOp(Call(Name('f')), 'Add', ListComp(Name('x'), [Gen(Name('x'), Call(Name('g')))])))));
  expect(out.body.length).toBe(1);
  expect(out.body[0].value.right.type).toBe('ListComp');
});

test('PRESERVE: z = f() + (a if c else b) — ternary after a side-effecting expr is NOT hoisted', () => {
  const out = run(Module(Assign('z', BinOp(Call(Name('f')), 'Add', IfExp(Call(Name('cond')), Name('a'), Name('b'))))));
  expect(out.body.length).toBe(1);
  expect(out.body[0].value.right.type).toBe('IfExp');
});

test('z = a + [comp] — pure (Name) operand before the comp still desugars', () => {
  const out = run(Module(Assign('z', BinOp(Name('a'), 'Add', ListComp(Name('x'), [Gen(Name('x'), Name('xs'))])))));
  expect(out.body.length).toBe(3);
  expect(JSON.stringify(out).includes('ListComp')).toBe(false);
});

test('AugAssign with a Name target desugars the value: count += [comp] (pure target load)', () => {
  const out = run(Module({ type: 'AugAssign', target: Name('count'), op: { type: 'Add' },
    value: ListComp(Name('i'), [Gen(Name('i'), Call(Name('g')))]) }));
  expect(out.body.length).toBe(3);
  expect(out.body[2].type).toBe('AugAssign');
  expect(JSON.stringify(out).includes('ListComp')).toBe(false);
});

test('PRESERVE: AugAssign with an Attribute target (c.x += [comp]) is NOT hoisted (impure target load)', () => {
  const out = run(Module({ type: 'AugAssign', target: Attr(Name('c'), 'x'), op: { type: 'Add' },
    value: ListComp(Name('i'), [Gen(Name('i'), Call(Name('g')))]) }));
  expect(out.body.length).toBe(1);
  expect(out.body[0].value.type).toBe('ListComp');
});

// ----- chained compare is position-independent: desugars in non-hoisting (lazy) stmt fields -----

test('chained compare in an if-test desugars to BoolOp(And) (no hoist needed)', () => {
  const out = run(Module({ type: 'If', test: Compare(Const(60), ['Lt', 'Lt'], [Name('speed'), Const(120)]),
    body: [{ type: 'Pass' }], orelse: [] }));
  expect(out.body.length).toBe(1);
  expect(out.body[0].type).toBe('If');
  expect(out.body[0].test.type).toBe('BoolOp');
  expect(out.body[0].test.op.type).toBe('And');
});

test('chained compare in a while-test desugars (BoolOp(And), re-evaluated each iteration)', () => {
  const out = run(Module({ type: 'While', test: Compare(Name('a'), ['Lt', 'Lt'], [Name('b'), Name('c')]),
    body: [{ type: 'Pass' }], orelse: [] }));
  expect(out.body[0].test.type).toBe('BoolOp');
});

test('PRESERVE: a ternary in an if-test is NOT desugared (no hoisting into a non-eager field)', () => {
  const out = run(Module({ type: 'If', test: IfExp(Name('c'), Name('a'), Name('b')),
    body: [{ type: 'Pass' }], orelse: [] }));
  expect(out.body.length).toBe(1);
  expect(out.body[0].test.type).toBe('IfExp');
});

test('comprehension filter -> nested If inside the loop body', () => {
  const out = run(Module(Assign('r', ListComp(Name('x'), [Gen(Name('x'), Name('xs'), [Compare(Name('x'), ['Gt'], [Const(0)])])]))));
  const loop = out.body[1];
  expect(loop.body.length).toBe(1);
  const iff = loop.body[0];
  expect(iff.type).toBe('If');
  expect(iff.test.type).toBe('Compare');
  expect(iff.orelse).toEqual([]);
  expect(iff.body[0].value.func.attr).toBe('append');
});

test('two ifs in one generator -> two nested Ifs (c1 outer, c2 inner)', () => {
  const c1 = Compare(Name('x'), ['Gt'], [Const(0)]);
  const c2 = Compare(Name('x'), ['Lt'], [Const(9)]);
  const out = run(Module(Assign('r', ListComp(Name('x'), [Gen(Name('x'), Name('xs'), [c1, c2])]))));
  const loop = out.body[1];
  const outerIf = loop.body[0];
  expect(outerIf.type).toBe('If');
  expect(outerIf.test.comparators[0].value).toBe(0);   // c1
  const innerIf = outerIf.body[0];
  expect(innerIf.type).toBe('If');
  expect(innerIf.test.comparators[0].value).toBe(9);   // c2
  expect(innerIf.body[0].value.func.attr).toBe('append');
});

test('multiple generators -> nested For loops (outer = generators[0])', () => {
  const out = run(Module(Assign('r', ListComp(BinOp(Name('x'), 'Add', Name('y')),
    [Gen(Name('x'), Name('xs')), Gen(Name('y'), Name('ys'))]))));
  const outerFor = out.body[1];
  expect(outerFor.type).toBe('For');
  expect(outerFor.target.id).toBe('x');
  expect(outerFor.iter.id).toBe('xs');
  const innerFor = outerFor.body[0];
  expect(innerFor.type).toBe('For');
  expect(innerFor.target.id).toBe('y');
  expect(innerFor.iter.id).toBe('ys');
  expect(innerFor.body[0].value.func.attr).toBe('append');
});

test('PRESERVE: generator expression is NOT desugared (lazy -> list is non-equivalent)', () => {
  const out = run(Module(Assign('g', GenExp(Name('x'), [Gen(Name('x'), Name('xs'))]))));
  expect(out.body.length).toBe(1);
  expect(out.body[0].value.type).toBe('GeneratorExp');
});

test('PRESERVE: async comprehension is kept as a comprehension', () => {
  const out = run(Module(Assign('r', ListComp(Name('x'), [Gen(Name('x'), Name('xs'), [], 1)]))));
  expect(out.body.length).toBe(1);
  expect(out.body[0].value.type).toBe('ListComp');
});

test('PRESERVE: comprehension in a lazy BoolOp slot stays a ListComp', () => {
  const out = run(Module(Assign('z', BoolOp('And', [Name('y'), ListComp(Name('x'), [Gen(Name('x'), Name('xs'))])]))));
  expect(out.body.length).toBe(1);
  expect(out.body[0].value.values[1].type).toBe('ListComp');
});

test('comprehension as an eager Call arg desugars: total = sum([x for x in xs])', () => {
  const out = run(Module(Assign('total', Call(Name('sum'), [ListComp(Name('x'), [Gen(Name('x'), Name('xs'))])]))));
  // hoisted: acc init + for; then total = sum(acc)
  expect(out.body.length).toBe(3);
  expect(out.body[2].value.type).toBe('Call');
  expect(out.body[2].value.func.id).toBe('sum');
  const acc = out.body[0].targets[0].id;
  expect(out.body[2].value.args[0].id).toBe(acc);
});

test('nested comprehension in elt desugars recursively inside the loop body', () => {
  const inner = ListComp(Name('y'), [Gen(Name('y'), Name('ys'))]);
  const out = run(Module(Assign('m', ListComp(inner, [Gen(Name('x'), Name('xs'))]))));
  // outer: acc1=[]; for x in xs: <inner desugared here>; m = acc1
  const outerFor = out.body[1];
  expect(outerFor.type).toBe('For');
  // inside the loop body, the inner comprehension is unrolled to its own acc init + for + append,
  // then outer-appends that accumulator — i.e. NO ListComp survives anywhere.
  const json = JSON.stringify(out);
  expect(json.includes('ListComp')).toBe(false);
  // the outer loop body has its own nested init + for + outer-append (3 statements)
  expect(outerFor.body.length).toBe(3);
  expect(outerFor.body[0].value.type).toBe('List');                 // inner acc init
  expect(outerFor.body[1].type).toBe('For');                        // inner loop
  expect(outerFor.body[2].value.func.attr).toBe('append');          // outer append(inner acc)
});

test('left-to-right hoist order: z = [a for a in p] + [b for b in q]', () => {
  const lc1 = ListComp(Name('a'), [Gen(Name('a'), Name('p'))]);
  const lc2 = ListComp(Name('b'), [Gen(Name('b'), Name('q'))]);
  const out = run(Module(Assign('z', BinOp(lc1, 'Add', lc2))));
  // order: acc1 init, acc1 loop, acc2 init, acc2 loop, z = acc1 + acc2
  expect(out.body.map((s) => s.type)).toEqual(['Assign', 'For', 'Assign', 'For', 'Assign']);
  const acc1 = out.body[0].targets[0].id;
  const acc2 = out.body[2].targets[0].id;
  expect(out.body[1].iter.id).toBe('p');          // first loop iterates p
  expect(out.body[3].iter.id).toBe('q');          // second loop iterates q
  const final = out.body[4].value;
  expect(final.left.id).toBe(acc1);
  expect(final.right.id).toBe(acc2);
});

// ===== single-IR consistency: desugared output must be consumable by the block layer =====
// (invariant #3). irToBlockly/blocklyToIr are pure (no Pyodide); Pyodide semantic-equivalence
// is the browser test in slice 3.

test('desugared list comprehension is consumable by irToBlockly (for+append, no ir_listcomp)', () => {
  const mod = run(Module(Assign('squares', ListComp(BinOp(Name('i'), 'Mult', Name('i')), [Gen(Name('i'), rng(5))]))));
  const bj = IRB.irToBlockly(mod);
  const json = JSON.stringify(bj);
  expect(json.includes('ir_listcomp')).toBe(false);
  expect(json.includes('ir_for')).toBe(true);
  expect(json.includes('ir_call')).toBe(true);
  const back = IRB.blocklyToIr(bj);
  const backJson = JSON.stringify(back);
  expect(backJson.includes('ListComp')).toBe(false);
  expect(backJson.includes('"For"')).toBe(true);
});

test('desugared ternary is consumable by irToBlockly (ir_if, no ir_ifexp)', () => {
  const mod = run(Module(Assign('t', IfExp(Name('c'), Name('a'), Name('b')))));
  const bj = IRB.irToBlockly(mod);
  const json = JSON.stringify(bj);
  expect(json.includes('ir_ifexp')).toBe(false);
  expect(json.includes('ir_if')).toBe(true);
  const back = IRB.blocklyToIr(bj);
  expect(JSON.stringify(back).includes('IfExp')).toBe(false);
});

test('desugared chained compare is consumable by irToBlockly and round-trips to BoolOp(And)', () => {
  const mod = run(Module(Expr(Compare(Name('a'), ['Lt', 'Lt'], [Name('b'), Name('c')]))));
  const bj = IRB.irToBlockly(mod);
  expect(JSON.stringify(bj).includes('ir_boolop')).toBe(true);
  const back = IRB.blocklyToIr(bj);
  expect(back.body[0].value.type).toBe('BoolOp');
  expect(back.body[0].value.values.length).toBe(2);
});

test('desugared dict comprehension is consumable by irToBlockly (no ir_dictcomp)', () => {
  const mod = run(Module(Assign('d', DictComp(Name('k'), Name('v'), [Gen(Name('k'), Name('ks'))]))));
  const bj = IRB.irToBlockly(mod);
  expect(JSON.stringify(bj).includes('ir_dictcomp')).toBe(false);
  expect(() => IRB.blocklyToIr(bj)).not.toThrow();
});

// ===== class-body scope: comprehensions run in their own scope (no access to class names) =====
// (Codex P1). Desugaring a class-body comp to an inline loop would (a) resolve class names the
// comp scope cannot see (NameError divergence) and (b) leak temps as class attributes. So hoisting
// desugars (comp + ternary) are preserved directly in a class body; a method's body is fine.

const ClassDef = (name, body) => ({ type: 'ClassDef', name, bases: [], keywords: [],
  body, decorator_list: [], type_params: [] });
const noArgs = { type: 'arguments', posonlyargs: [], args: [{ type: 'arg', arg: 'self', annotation: null }],
  vararg: null, kwonlyargs: [], kw_defaults: [], kwarg: null, defaults: [] };
const FuncDef = (name, body) => ({ type: 'FunctionDef', name, args: noArgs, body,
  decorator_list: [], returns: null, type_params: [] });

test('PRESERVE: comprehension directly in a class body is NOT desugared (class scope)', () => {
  const out = run(Module(ClassDef('C', [
    Assign('x', Const(1)),
    Assign('y', ListComp(Name('x'), [Gen(Name('_'), rng(1))])),
  ])));
  const cls = out.body[0];
  expect(cls.type).toBe('ClassDef');
  expect(cls.body.length).toBe(2);                 // no hoisted temps injected into the class body
  expect(cls.body[1].value.type).toBe('ListComp');
});

test('PRESERVE: ternary directly in a class body is NOT desugared (temp would leak as a class attr)', () => {
  const out = run(Module(ClassDef('C', [Assign('y', IfExp(Name('c'), Name('a'), Name('b')))])));
  expect(out.body[0].body.length).toBe(1);
  expect(out.body[0].body[0].value.type).toBe('IfExp');
});

test('comprehension inside a METHOD (function scope) within a class IS still desugared', () => {
  const out = run(Module(ClassDef('C', [FuncDef('m', [Assign('y', ListComp(Name('i'), [Gen(Name('i'), rng(3))]))])])));
  const method = out.body[0].body[0];
  expect(method.type).toBe('FunctionDef');
  expect(method.body.length).toBe(3);              // acc init, for, y = acc
  expect(JSON.stringify(method).includes('ListComp')).toBe(false);
});

test('chained compare in a class body still desugars (no temp, no nested scope)', () => {
  const out = run(Module(ClassDef('C', [Assign('y', Compare(Const(1), ['Lt', 'Lt'], [Name('n'), Const(9)]))])));
  expect(out.body[0].body[0].value.type).toBe('BoolOp');
});

test('For.iter comprehension hoists before the loop: for z in [x for x in xs]: pass', () => {
  const out = run(Module(For(Name('z'), ListComp(Name('x'), [Gen(Name('x'), Name('xs'))]), [{ type: 'Pass' }])));
  // hoisted acc init + acc loop, then `for z in acc: pass`
  expect(out.body.length).toBe(3);
  expect(out.body[0].type).toBe('Assign');
  expect(out.body[1].type).toBe('For');
  expect(out.body[1].iter.id).toBe('xs');
  const acc = out.body[0].targets[0].id;
  expect(out.body[2].type).toBe('For');
  expect(out.body[2].target.id).toBe('z');
  expect(out.body[2].iter.id).toBe(acc);
});
