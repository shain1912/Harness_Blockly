/* irDesugar.js — pure JS: optional IR->IR desugar pass (Phase 4, opt-in "Auto Desugar").
 *
 * Rewrites SUGAR — chained Compare, ternary IfExp, comprehensions — into elementary
 * BoolOp/If/For/Assign/Call IR. This is a PEDAGOGICAL LENS: sugar already has dedicated blocks
 * (SUGAR coexistence), so desugaring is never required for round-trip; it just shows the
 * unrolled loop/conditional form. Emits ONLY existing IR node types, so irToBlockly / irToPython
 * already consume it (no new blocks; raw=0 unaffected). One-directional: desugared blocks
 * regenerate the loop form, never re-sugar back to a comprehension. See
 * DOCS/superpowers/specs/2026-06-19-desugar-as-feature-design.md.
 *
 * CORRECTNESS-FIRST. The hard invariant (#1, BLOCKING) is SEMANTIC EQUIVALENCE — same result,
 * side effects, AND evaluation order/count. A ternary/comprehension is HOISTED (its temp loop/
 * If placed before the statement) ONLY when it is provably evaluated EAGERLY (unconditionally,
 * once) AND nothing side-effect-capable is evaluated before it in the statement (else hoisting
 * would reorder side effects). Everything else PRESERVES the sugar node (always safe — still a
 * block). Two mechanisms guard this:
 *   - `eager` flag (threaded top-down, AND-ed per child slot): false inside any lazy/short-circuit/
 *     conditional/deferred slot, so ternary/comp there are preserved.
 *   - `st.impure` flag (threaded left-to-right in evaluation order): set once a side-effect-capable
 *     residual node has been evaluated; a ternary/comp reached while it is set is preserved.
 * Chained-compare with pure middles is the one position-INDEPENDENT rewrite (pure expr->expr, no
 * temp, BoolOp(And) preserves short-circuit), so it fires regardless of `eager`/`st` — including
 * in non-hoisting statement fields like an `if`/`while` test.
 *
 * KNOWN LIMITATIONS (documented NITs — accepted, non-blocking; semantic equivalence is judged on
 * the VALUE for realistic code). The two marked [Codex P1, accepted] are real equivalence gaps for
 * PATHOLOGICAL inputs that the design owner chose to accept (2026-06-22 decision: "Pragmatic —
 * clean + broad") rather than degrade the clean pedagogical output; they cannot arise in normal
 * Python a learner writes:
 *   - [Codex P1, accepted] CHAINED-COMPARE MIDDLE RE-READ. `a < b < c` is rewritten to
 *     `(a<b) and (b<c)`, duplicating the middle `b`. Python evaluates the middle ONCE; if a prior
 *     comparison's OVERLOADED operator (custom __lt__/__gt__ with side effects) mutates b's binding
 *     between the two reads, the desugared result can differ. (Impure middles like `a < f() < b`
 *     are still PRESERVED — isPure gate — since duplicating would double-CALL f, a real bug.)
 *   - [Codex P1, accepted] SUGAR HOISTED PAST A PURE OPERAND. A comp/ternary hoisted before its
 *     statement re-reads any PURE (Name/Constant/Attr) operand evaluated before it afterward; if the
 *     sugar's own evaluation mutates that operand (e.g. a comprehension whose iterable rebinds a
 *     global that is also an operand: `z = a + [x for x in g()]` where g() does `global a`), the
 *     re-read diverges. Side-effect-capable preceding operands (`f() + [comp]`, an Attribute/Subscript
 *     AugAssign target) ARE preserved (st.impure / initImpure); only pure-prefix cases are accepted.
 *   - a desugared comprehension uses its own target name in the loop, so that loop variable LEAKS
 *     into the enclosing scope (Python 3 scopes it; legacy desugarer leaked it too). Per design
 *     §4.1 "완벽한 위생 보장은 범위 외".
 *   - isPure treats Attribute on a pure base as pure (design §4.1 "pure의 Attribute"); a
 *     side-effecting @property would be read twice in a chained compare / not block hoisting.
 *   - SetComp init is `set()`, which resolves the name `set` — wrong if `set` is shadowed in scope.
 *   - a leading comment on a desugared statement stays on the residual (the `_acc` read), not on
 *     the hoisted loop. Comments are non-semantic.
 */

// Per-pass fresh-name counter (reset each desugarIr call so output is deterministic).
let _counter = 0;
const fresh = (prefix) => prefix + (_counter++);

// Deep clone — the IR is JSON-serializable by construction (see pyAstBridge.js).
const clone = (n) => JSON.parse(JSON.stringify(n));

// New-node builders. ctx is cosmetic: ast.unparse (our only text consumer) and irToBlockly both
// ignore Name/expr ctx, but we set the canonical value for readability/future-proofing.
const mkName = (id, ctx) => ({ type: 'Name', id, ctx: { type: ctx } });
const mkAttr = (value, attr) => ({ type: 'Attribute', value, attr, ctx: { type: 'Load' } });
const mkCall = (func, args) => ({ type: 'Call', func, args, keywords: [] });
const mkExpr = (value) => ({ type: 'Expr', value });
const mkAssign = (target, value) => ({ type: 'Assign', targets: [target], value, type_comment: null });

// A "pure" expr re-evaluates with no side effect and a stable value, so it may appear in two
// comparison pairs without a temp. Name/Constant, and Attribute on a pure base (design §4.1 opts
// `a.b` / `self.x` into pure for the chained-compare rewrite; see the NIT above).
function isPure(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.type === 'Name' || e.type === 'Constant') return true;
  if (e.type === 'Attribute') return isPure(e.value);
  return false;
}

// Side-effect test for evaluation-ORDER reasoning (would evaluating this residual node before a
// later hoist reorder anything observable?). Mirrors isPure: Name/Constant and Attribute on a pure
// base are effect-free; everything else (Call, Subscript, operators, preserved comprehensions, ...)
// is ordering-relevant. Treating a pure-base Attribute as effect-free is the SAME design decision
// as isPure (§4.1 "pure의 Attribute"; a side-effecting @property is the documented NIT) — and it is
// also what lets our own generated `_acc.append(...)` / `_acc.add(...)` calls (a pure-base method
// access in the func slot) not block desugaring of a nested comprehension in their argument.
function mayHaveSideEffects(node) {
  return !isPure(node);
}

// A chained Compare (>=2 ops) -> BoolOp(And, [pairwise Compares]) ONLY when every SHARED middle
// operand (comparators except the last; the last and the leftmost each appear once) is pure. Then
// re-evaluating a middle is free + stable and BoolOp(And) keeps the exact short-circuit
// semantics, making this safe in ANY position with no temp hoist.
function isDesugarableChain(node) {
  return node.type === 'Compare'
    && Array.isArray(node.ops) && node.ops.length >= 2
    && node.comparators.slice(0, -1).every(isPure);
}
function rewriteChain(node) {
  const operands = [node.left, ...node.comparators];
  const values = node.ops.map((op, i) => ({
    type: 'Compare',
    left: clone(operands[i]),                 // clone each placement: middles appear in two pairs
    ops: [op],
    comparators: [clone(operands[i + 1])],
  }));
  return { type: 'BoolOp', op: { type: 'And' }, values };
}

// A comprehension is desugarable when it is a list/set/dict comp (NOT a GeneratorExp — lazy ->
// list is non-equivalent) with >=1 generator and NO async generator (`async for`).
const COMP_TYPES = new Set(['ListComp', 'SetComp', 'DictComp']);
function isDesugarableComp(node) {
  return COMP_TYPES.has(node.type)
    && Array.isArray(node.generators) && node.generators.length >= 1
    && node.generators.every((g) => !g.is_async);
}

// expr -> expr, collecting hoisted temp statements into `hoist`. `eager`: is this position
// evaluated unconditionally exactly once relative to the statement? `st.impure`: has a
// side-effect-capable residual evaluation already happened to the left (in eval order)?
function desugarExpr(node, hoist, eager, st, inClassBody) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return node;

  // Position-INDEPENDENT: pure chained compare folds anywhere (no hoist, no temp, no nested scope) —
  // safe even directly in a class body.
  if (isDesugarableChain(node)) return desugarExpr(rewriteChain(node), hoist, eager, st, inClassBody);

  // Position-DEPENDENT (hoisting) rewrites: only when eager, nothing impure precedes, and NOT
  // directly in a class body. A class body is its own namespace that nested scopes can't read, so
  // a class-level comprehension runs in a scope without the class names (desugaring to an inline
  // loop would resolve them and change behavior); and any hoisted temp would leak as a class
  // attribute. Inside a method (function scope) inClassBody is false again, so those desugar.
  if (eager && !st.impure && !inClassBody && node.type === 'IfExp') return desugarIfExp(node, hoist, inClassBody);
  if (eager && !st.impure && !inClassBody && isDesugarableComp(node)) return desugarComp(node, hoist);

  // Preserved/other node: recurse children (threads eager + impure in eval order), then — if this
  // residual node may itself have a side effect — mark impure for subsequent siblings.
  const out = recurseChildren(node, hoist, eager, st, inClassBody);
  if (mayHaveSideEffects(node)) st.impure = true;
  return out;
}

// Ternary -> hoisted `if test: _t = body` `else: _t = orelse`, expression becomes `_t`. Both
// branches assign, so no None pre-init. The branch VALUES sit in Assign.value (eager within their
// branch) and are desugared when the hoisted If is re-walked — preserving laziness (a branch only
// runs under its condition). The test is desugared here (with a FRESH order state: the test is the
// first thing the hoisted If evaluates) since If.test is not re-processed as an eager field.
function desugarIfExp(node, hoist, inClassBody) {
  const tmp = fresh('_bp_tern_');
  hoist.push({
    type: 'If',
    test: desugarExpr(node.test, hoist, true, { impure: false }, inClassBody),
    body: [mkAssign(mkName(tmp, 'Store'), node.body)],
    orelse: [mkAssign(mkName(tmp, 'Store'), node.orelse)],
  });
  return mkName(tmp, 'Load');
}

// Comprehension -> accumulator pattern: `_acc = <empty>` + nested for/if loops whose innermost
// body appends/adds/(key-temp + subscript-assigns) the element; the expression becomes `_acc`.
// The init + outermost For are hoisted, then re-walked by desugarStmt — which recursively
// desugars any sugar in elt/key/value/iter at the correct (per-iteration) scope.
function desugarComp(node, hoist) {
  const acc = fresh('_bp_acc_');
  let init;
  let body;        // innermost loop body (statement list)
  if (node.type === 'ListComp') {
    init = { type: 'List', elts: [], ctx: { type: 'Load' } };
    body = [mkExpr(mkCall(mkAttr(mkName(acc, 'Load'), 'append'), [node.elt]))];
  } else if (node.type === 'SetComp') {
    init = mkCall(mkName('set', 'Load'), []);
    body = [mkExpr(mkCall(mkAttr(mkName(acc, 'Load'), 'add'), [node.elt]))];
  } else { // DictComp: a bare `acc[key] = value` evaluates value BEFORE key (Python store-subscript
    // order), reversing the dict comp's key-before-value order. Hoist the key into a temp first so
    // key is evaluated, then value, then stored.
    init = { type: 'Dict', keys: [], values: [] };
    const kt = fresh('_bp_key_');
    body = [
      mkAssign(mkName(kt, 'Store'), node.key),
      mkAssign({ type: 'Subscript', value: mkName(acc, 'Load'), slice: mkName(kt, 'Load'), ctx: { type: 'Store' } },
        node.value),
    ];
  }
  // Fold generators inner -> outer. Each wraps the running body in its filters (last filter =
  // innermost If) then a For. generators[0] becomes the OUTERMOST loop.
  for (let gi = node.generators.length - 1; gi >= 0; gi--) {
    const g = node.generators[gi];
    for (let fi = (g.ifs || []).length - 1; fi >= 0; fi--) {
      body = [{ type: 'If', test: g.ifs[fi], body, orelse: [] }];
    }
    body = [{ type: 'For', target: g.target, iter: g.iter, body, orelse: [], type_comment: null }];
  }
  hoist.push(mkAssign(mkName(acc, 'Store'), init));
  hoist.push(body[0]);           // the outermost For
  return mkName(acc, 'Load');
}

// Recurse into a non-sugar node's children IN EVALUATION ORDER. Eager child slots inherit `eager`;
// lazy slots get false. The SAME `st` is threaded through every child (eager and lazy) so the
// left-to-right impure flag accumulates correctly. Opaque nodes are returned as-is (leaf nodes,
// out-of-scope forms Lambda/Await/Yield/YieldFrom/NamedExpr/f-string, and comprehensions whose
// internals are their own scope + lazy — the desugarable case is handled in desugarExpr).
function recurseChildren(node, hoist, eager, st, inClassBody) {
  const E = (n, slotEager) => desugarExpr(n, hoist, eager && slotEager, st, inClassBody);
  switch (node.type) {
    case 'Call': return { ...node,
      func: E(node.func, true),
      args: (node.args || []).map((a) => E(a, true)),
      keywords: (node.keywords || []).map((k) => ({ ...k, value: E(k.value, true) })) };
    case 'BinOp': return { ...node, left: E(node.left, true), right: E(node.right, true) };
    case 'UnaryOp': return { ...node, operand: E(node.operand, true) };
    // BoolOp: only the first operand is unconditional; the rest short-circuit.
    case 'BoolOp': return { ...node, values: (node.values || []).map((v, i) => E(v, i === 0)) };
    // Compare (non-desugarable: single-op or non-pure middle): left + comparators[0] always
    // evaluated; comparators[1..] reached only if earlier comparisons hold (short-circuit).
    case 'Compare': return { ...node,
      left: E(node.left, true),
      comparators: (node.comparators || []).map((c, i) => E(c, i === 0)) };
    case 'List': case 'Tuple': case 'Set':
      return { ...node, elts: (node.elts || []).map((e) => E(e, true)) };
    case 'Dict': {                                  // evaluated key0,value0,key1,value1,... (interleaved)
      const keys = node.keys || []; const values = node.values || [];
      const ok = []; const ov = [];
      for (let i = 0; i < values.length; i++) {
        ok.push(keys[i] == null ? keys[i] : E(keys[i], true));   // null key = ** unpack
        ov.push(E(values[i], true));
      }
      return { ...node, keys: ok, values: ov };
    }
    case 'Subscript': return { ...node, value: E(node.value, true), slice: E(node.slice, true) };
    case 'Slice': {
      const out = { ...node };
      if (node.lower != null) out.lower = E(node.lower, true);
      if (node.upper != null) out.upper = E(node.upper, true);
      if (node.step != null) out.step = E(node.step, true);
      return out;
    }
    case 'Attribute': return { ...node, value: E(node.value, true) };
    case 'Starred': return { ...node, value: E(node.value, true) };
    // IfExp reached here only when NOT desugared (lazy, or preceded by impure): test is eager-slot,
    // body/orelse lazy. Recurse anyway to fold any pure chained compares within.
    case 'IfExp': return { ...node, test: E(node.test, true), body: E(node.body, false), orelse: E(node.orelse, false) };
    default: return node;   // opaque
  }
}

// Statement fields whose EXPRESSION is evaluated eagerly (once, unconditionally) — the only entry
// points where a hoisted temp BEFORE the statement is order-equivalent. Excludes While.test
// (re-evaluated per iteration) and If.test/With/Assert/Raise/Match.subject (handled as lazy
// fields below — chained compare only). Loop/branch BODIES are handled by suite recursion.
const EAGER_STMT_FIELDS = {
  Expr: ['value'], Assign: ['value'], AugAssign: ['value'],
  AnnAssign: ['value'], Return: ['value'], For: ['iter'], AsyncFor: ['iter'],
};

// Statement expression fields that are NOT safe hoist points but are still visited for the
// position-independent chained-compare rewrite (eager=false: no hoisting, only the pure
// chained-compare -> BoolOp fold). Optional fields (msg/exc/cause) are guarded for null.
const LAZY_STMT_EXPR_FIELDS = {
  If: ['test'], While: ['test'], Assert: ['test', 'msg'], Raise: ['exc', 'cause'], Match: ['subject'],
};

// Statement fields that are nested suites (statement lists) to recurse into.
const SUITE_FIELDS = {
  If: ['body', 'orelse'], While: ['body', 'orelse'],
  For: ['body', 'orelse'], AsyncFor: ['body', 'orelse'],
  With: ['body'], AsyncWith: ['body'],
  FunctionDef: ['body'], AsyncFunctionDef: ['body'], ClassDef: ['body'],
};

function recurseSuites(stmt, inClassBody) {
  const walk = (list, ic) => (list || []).flatMap((s) => desugarStmt(s, ic));
  const simple = SUITE_FIELDS[stmt.type];
  if (simple) {
    // Scope of the child statements: a ClassDef body is class scope (no hoisting desugar — see
    // desugarExpr); a (Async)FunctionDef body is a fresh function scope (hoisting desugar OK again);
    // other compounds (if/for/while/with) stay in the current scope.
    const childIc = stmt.type === 'ClassDef' ? true
      : (stmt.type === 'FunctionDef' || stmt.type === 'AsyncFunctionDef') ? false
        : inClassBody;
    const out = { ...stmt };
    for (const f of simple) if (Array.isArray(out[f])) out[f] = walk(out[f], childIc);
    return out;
  }
  if (stmt.type === 'Try' || stmt.type === 'TryStar') {
    return { ...stmt,
      body: walk(stmt.body, inClassBody),
      orelse: walk(stmt.orelse, inClassBody),
      finalbody: walk(stmt.finalbody, inClassBody),
      handlers: (stmt.handlers || []).map((h) => ({ ...h, body: walk(h.body, inClassBody) })) };
  }
  if (stmt.type === 'Match') {
    return { ...stmt, cases: (stmt.cases || []).map((c) => ({ ...c, body: walk(c.body, inClassBody) })) };
  }
  return stmt;
}

// The order-state at the START of a statement's eager field — what is evaluated BEFORE it.
function initImpure(stmt) {
  // AugAssign loads its TARGET before the value. A bare Name target load is side-effect-free; any
  // non-Name target (Attribute @property / Subscript) may have a side-effecting load, so a hoisted
  // value-sugar would be reordered before it -> treat as impure-before (preserve). Stricter than
  // mayHaveSideEffects on purpose: here the target's load really does precede the RHS.
  if (stmt.type === 'AugAssign') return !stmt.target || stmt.target.type !== 'Name';
  return false;   // Assign/Expr/Return/AnnAssign value & For/AsyncFor iter are evaluated first
}

// stmt -> [stmt...]: eager expr fields may hoist temps (placed before the rewritten stmt); lazy
// expr fields fold chained compares in place; suites recurse; hoisted statements are themselves
// re-walked (sugar relocated into a loop body / branch is desugared at that scope). Pure: never
// mutates the input (shallow-copy on change).
function desugarStmt(stmt, inClassBody) {
  if (!stmt || typeof stmt !== 'object' || typeof stmt.type !== 'string') return [stmt];
  const hoist = [];
  let out = stmt;
  const eagerFields = EAGER_STMT_FIELDS[stmt.type];
  if (eagerFields) {
    out = { ...stmt };
    const st = { impure: initImpure(stmt) };
    for (const f of eagerFields) if (out[f] != null) out[f] = desugarExpr(out[f], hoist, true, st, inClassBody);
  }
  const lazyFields = LAZY_STMT_EXPR_FIELDS[stmt.type];
  if (lazyFields) {
    if (out === stmt) out = { ...stmt };
    for (const f of lazyFields) if (out[f] != null) out[f] = desugarExpr(out[f], hoist, false, { impure: false }, inClassBody);
  }
  out = recurseSuites(out, inClassBody);
  // Hoisted statements are at THIS statement's scope (only produced when not in a class body, so
  // inClassBody is false here whenever hoist is non-empty).
  const desugaredHoist = hoist.flatMap((s) => desugarStmt(s, inClassBody));
  return [...desugaredHoist, out];
}

// Public entry. Total/defensive: returns a NEW Module with sugar desugared in safe positions; any
// per-statement error preserves that statement unchanged (the whole pass never throws, so a
// desugar bug can never break Convert — it falls back to SUGAR blocks).
function desugarIr(module) {
  if (!module || module.type !== 'Module' || !Array.isArray(module.body)) return module;
  _counter = 0;
  const body = [];
  for (const stmt of module.body) {
    try { body.push(...desugarStmt(stmt, false)); }   // module scope: not a class body
    catch (_) { body.push(stmt); }
  }
  return { ...module, body };
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIrDesugar = { desugarIr, isPure };
if (typeof module !== 'undefined') module.exports = api.BlockPyIrDesugar;
