/* irToBlockly.js — pure JS: canonical AST-IR -> Blockly workspace JSON.
 *
 * The IR is the CPython-3.12 ast shape (see pyAstBridge.js). This module maps each IR
 * node to a Blockly block, one direction of the single-IR round-trip. blocklyToIr.js is
 * the inverse; the two share the block-type/field schema so parity is structural.
 *
 * Handlers are kept as maps (not a switch) so HANDLED auto-tracks which ast node types
 * have a block — the raw=0 coverage test reads BlockPyIR.__handled.
 */

// Closed CPython-3.12 totality table (raw=0): EVERY ast node class is categorized.
// DB = dedicated block (implemented + has a handler), SUGAR = block + desugar (implemented),
// PENDING = planned DB/SUGAR not yet implemented (the node-family worklist; eventual DB-vs-
// SUGAR per spec §5), HELPER = part of parent, FIELD = enum dropdown, ROOT = Module,
// SKIP = abstract base / parse-mode root / ctx / deprecated.
// The ir_coverage test asserts: every Pyodide-3.12 node appears here (no silent gap), and
// every DB/SUGAR node actually has a handler (so a node is only marked DB/SUGAR once it
// truly round-trips). The worklist (#1–#16) is complete: no PENDING entries remain (raw=0
// achieved). PENDING stays documented above as the regression signal if a node is ever added.
const NODE_POLICY = {
  Module: 'ROOT',
  // statements
  FunctionDef: 'DB', AsyncFunctionDef: 'DB', ClassDef: 'DB', Return: 'DB',
  Delete: 'DB', Assign: 'DB', AugAssign: 'DB', AnnAssign: 'DB', For: 'DB',
  AsyncFor: 'DB', While: 'DB', If: 'DB', With: 'DB', AsyncWith: 'DB',
  Match: 'DB', Raise: 'DB', Try: 'DB', TryStar: 'DB', Assert: 'DB',
  Import: 'DB', ImportFrom: 'DB', Global: 'DB', Nonlocal: 'DB', Pass: 'DB',
  Break: 'DB', Continue: 'DB', TypeAlias: 'DB', Expr: 'DB',
  // expressions
  BoolOp: 'DB', NamedExpr: 'DB', BinOp: 'DB', UnaryOp: 'DB', Lambda: 'DB',
  Dict: 'DB', Set: 'DB', Await: 'DB', Yield: 'DB', YieldFrom: 'DB',
  Compare: 'DB', Call: 'DB', JoinedStr: 'DB', Constant: 'DB', Attribute: 'DB',
  Subscript: 'DB', Starred: 'DB', Name: 'DB', List: 'DB', Tuple: 'DB',
  // sugar (dedicated block now; the desugar-as-feature pass is Phase 4)
  IfExp: 'SUGAR', ListComp: 'SUGAR', SetComp: 'SUGAR', DictComp: 'SUGAR', GeneratorExp: 'SUGAR',
  // helpers (rendered as part of a parent block)
  FormattedValue: 'HELPER', Slice: 'DB', comprehension: 'HELPER', ExceptHandler: 'HELPER',
  arguments: 'HELPER', arg: 'HELPER', keyword: 'HELPER', alias: 'HELPER', withitem: 'HELPER',
  match_case: 'HELPER',
  MatchValue: 'HELPER', MatchSingleton: 'HELPER', MatchSequence: 'HELPER', MatchMapping: 'HELPER',
  MatchClass: 'HELPER', MatchStar: 'HELPER', MatchAs: 'HELPER', MatchOr: 'HELPER',
  TypeVar: 'HELPER', ParamSpec: 'HELPER', TypeVarTuple: 'HELPER',
  // operator enums -> dropdown fields on the parent block
  And: 'FIELD', Or: 'FIELD', Add: 'FIELD', Sub: 'FIELD', Mult: 'FIELD', MatMult: 'FIELD',
  Div: 'FIELD', Mod: 'FIELD', Pow: 'FIELD', LShift: 'FIELD', RShift: 'FIELD', BitOr: 'FIELD',
  BitXor: 'FIELD', BitAnd: 'FIELD', FloorDiv: 'FIELD', Invert: 'FIELD', Not: 'FIELD',
  UAdd: 'FIELD', USub: 'FIELD', Eq: 'FIELD', NotEq: 'FIELD', Lt: 'FIELD', LtE: 'FIELD',
  Gt: 'FIELD', GtE: 'FIELD', Is: 'FIELD', IsNot: 'FIELD', In: 'FIELD', NotIn: 'FIELD',
  // skip: abstract bases, alternate parse-mode roots, ctx (positionally derived), deprecated
  AST: 'SKIP', mod: 'SKIP', stmt: 'SKIP', expr: 'SKIP', expr_context: 'SKIP', boolop: 'SKIP',
  operator: 'SKIP', unaryop: 'SKIP', cmpop: 'SKIP', excepthandler: 'SKIP', pattern: 'SKIP',
  type_param: 'SKIP', type_ignore: 'SKIP', slice: 'SKIP',
  Expression: 'SKIP', Interactive: 'SKIP', FunctionType: 'SKIP', Suite: 'SKIP',
  Load: 'SKIP', Store: 'SKIP', Del: 'SKIP', AugLoad: 'SKIP', AugStore: 'SKIP', Param: 'SKIP',
  _ast_Ellipsis: 'SKIP', TypeIgnore: 'SKIP', ExtSlice: 'SKIP', Index: 'SKIP',
  // Deprecated constant aliases: ast.parse never emits these (it emits Constant). Their
  // presence in dir(ast) varies by build (Pyodide 3.12.1 exposes only `_ast_Ellipsis`,
  // serving Num/Str/Bytes/NameConstant/Ellipsis lazily via module __getattr__). Categorized
  // SKIP so any build that does expose them stays covered; the coverage test treats this
  // set as optional so absent ones are not flagged stale.
  Num: 'SKIP', Str: 'SKIP', Bytes: 'SKIP', NameConstant: 'SKIP', Ellipsis: 'SKIP',
};

// Deprecated alias names whose presence in dir(ast) is build-dependent (see above).
const OPTIONAL_DEPRECATED = ['Num', 'Str', 'Bytes', 'NameConstant', 'Ellipsis', '_ast_Ellipsis'];

function blk(type, fields = {}, inputs = {}) {
  return { type, fields, inputs };
}

// A statement list -> a Blockly statement-input value (first block + next-chain), or
// undefined when empty (so optional bodies like a missing else are simply omitted).
function stmtStack(stmts) {
  if (!stmts || !stmts.length) return undefined;
  const blocks = stmts.map(stmtToBlock);
  for (let i = 0; i < blocks.length - 1; i++) blocks[i].next = { block: blocks[i + 1] };
  return { block: blocks[0] };
}

// Flatten a CPython `arguments` node into a unified ordered param list + writes the
// annotation/default EXPRESSION children into `inputs` keyed ANN<i>/DEF<i> (i = flat order).
// The param list (name + kind + ann/def flags) is structural metadata for extraState.
function argsFragment(a, inputs) {
  const params = [];
  const push = (arg, kind, defExpr) => {
    const i = params.length;
    const p = { name: arg.arg, kind };
    if (arg.annotation !== null && arg.annotation !== undefined) {
      p.ann = true; inputs['ANN' + i] = { block: exprToBlock(arg.annotation) };
    }
    if (defExpr !== null && defExpr !== undefined) {
      p.def = true; inputs['DEF' + i] = { block: exprToBlock(defExpr) };
    }
    params.push(p);
  };
  const posonly = a.posonlyargs || [];
  const norm = a.args || [];
  const defaults = a.defaults || [];           // align with TAIL of posonly+norm
  const defStart = (posonly.length + norm.length) - defaults.length;
  posonly.forEach((arg, idx) => push(arg, 'posonly', idx >= defStart ? defaults[idx - defStart] : null));
  norm.forEach((arg, idx) => {
    const g = posonly.length + idx;
    push(arg, 'arg', g >= defStart ? defaults[g - defStart] : null);
  });
  if (a.vararg) push(a.vararg, 'vararg', null);
  (a.kwonlyargs || []).forEach((arg, idx) => push(arg, 'kwonly', (a.kw_defaults || [])[idx]));
  if (a.kwarg) push(a.kwarg, 'kwarg', null);
  return params;
}

// PEP-695 type parameters (def f[T], class C[T: int], def g[*Ts], def h[**P]). Encodes the
// name + kind + optional bound/default exprs (bound only on TypeVar; default_value is 3.13+
// so a no-op on Pyodide 3.12). Shared by FunctionDef/ClassDef/TypeAlias.
function tparamsFragment(tparams, inputs) {
  return (tparams || []).map((tp, i) => {
    const t = { name: tp.name, kind: tp.type };
    if (tp.bound !== null && tp.bound !== undefined) {
      t.bound = true; inputs['TPB' + i] = { block: exprToBlock(tp.bound) };
    }
    if (tp.default_value !== null && tp.default_value !== undefined) {
      t.def = true; inputs['TPD' + i] = { block: exprToBlock(tp.default_value) };
    }
    return t;
  });
}

// Serialize a match pattern (all 8 nodes are HELPERs) into a plain structural object. Embedded
// expressions are pushed into the block inputs via addExpr, which returns their index (the
// pattern object stores indices, not the exprs). Inverse: decPattern in blocklyToIr.
function encPattern(pat, addExpr) {
  switch (pat.type) {
    case 'MatchValue':     return { p: 'V', e: addExpr(pat.value) };
    case 'MatchSingleton': return { p: 'S', v: pat.value };   // raw None/True/False
    case 'MatchSequence':  return { p: 'Seq', items: (pat.patterns || []).map((x) => encPattern(x, addExpr)) };
    case 'MatchMapping':   return { p: 'Map',
      keys: (pat.keys || []).map(addExpr),
      pats: (pat.patterns || []).map((x) => encPattern(x, addExpr)),
      rest: pat.rest !== null && pat.rest !== undefined ? pat.rest : null };
    case 'MatchClass':     return { p: 'Cls',
      cls: addExpr(pat.cls),
      pats: (pat.patterns || []).map((x) => encPattern(x, addExpr)),
      kwd_attrs: pat.kwd_attrs || [],
      kwd_pats: (pat.kwd_patterns || []).map((x) => encPattern(x, addExpr)) };
    case 'MatchStar':      return { p: 'Star', name: pat.name !== null && pat.name !== undefined ? pat.name : null };
    case 'MatchAs':        return { p: 'As',
      name: pat.name !== null && pat.name !== undefined ? pat.name : null,
      sub: pat.pattern !== null && pat.pattern !== undefined ? encPattern(pat.pattern, addExpr) : null };
    case 'MatchOr':        return { p: 'Or', items: (pat.patterns || []).map((x) => encPattern(x, addExpr)) };
    default: throw new Error('irToBlockly: unknown match pattern ' + pat.type);
  }
}

// For/AsyncFor share one shape; async-ness is encoded in the block type (ir_for vs ir_asyncfor).
function forBlock(type, n) {
  const inputs = {
    TARGET: { block: exprToBlock(n.target) },
    ITER: { block: exprToBlock(n.iter) },
    BODY: stmtStack(n.body),
  };
  const orelse = stmtStack(n.orelse);
  if (orelse) inputs.ORELSE = orelse;
  return blk(type, {}, inputs);
}

// FunctionDef/AsyncFunctionDef share one shape; async-ness is the block type (ir_funcdef vs
// ir_asyncfuncdef). Signature/decorators/return/body all match FunctionDef exactly.
function funcDefBlock(type, n) {
  const inputs = {};
  const params = argsFragment(n.args, inputs);
  const tparams = tparamsFragment(n.type_params, inputs);
  (n.decorator_list || []).forEach((d, i) => { inputs['DEC' + i] = { block: exprToBlock(d) }; });
  if (n.returns !== null && n.returns !== undefined) inputs.RETURNS = { block: exprToBlock(n.returns) };
  inputs.BODY = stmtStack(n.body);
  return { type, fields: { NAME: n.name },
    extraState: { params, tparams, ndec: (n.decorator_list || []).length, ret: n.returns != null }, inputs };
}

// With/AsyncWith body: one CTX<i> input per item, plus VAR<i> when it binds `as`. The per-
// item `as` flag lives in extraState so a real save/load rebuilds the matching inputs.
function withBlock(type, n) {
  const inputs = {};
  const items = (n.items || []).map((it, i) => {
    inputs['CTX' + i] = { block: exprToBlock(it.context_expr) };
    const item = { as: false };
    if (it.optional_vars !== null && it.optional_vars !== undefined) {
      item.as = true;
      inputs['VAR' + i] = { block: exprToBlock(it.optional_vars) };
    }
    return item;
  });
  inputs.BODY = stmtStack(n.body);
  return { type, extraState: { items }, inputs };
}

// Try/TryStar body: BODY suite + N handlers + optional ELSE/FINALLY suites. Each handler's
// exception class is the bridge-remapped `_field_type` (TYPE<i> input when present); its
// `as name` and type-presence flag live in extraState; its suite is HBODY<i>.
function tryBlock(type, n) {
  const inputs = { BODY: stmtStack(n.body) };
  const handlers = (n.handlers || []).map((h, i) => {
    const hd = { type: false, name: h.name !== null && h.name !== undefined ? h.name : null };
    if (h._field_type !== null && h._field_type !== undefined) {
      hd.type = true;
      inputs['TYPE' + i] = { block: exprToBlock(h._field_type) };
    }
    const body = stmtStack(h.body);
    if (body) inputs['HBODY' + i] = body;
    return hd;
  });
  const orelse = stmtStack(n.orelse);
  if (orelse) inputs.ELSE = orelse;
  const finalbody = stmtStack(n.finalbody);
  if (finalbody) inputs.FINALLY = finalbody;
  return { type, extraState: { handlers }, inputs };
}

// A collection of element expressions (List/Tuple/Set) -> variable-arity block.
function eltsBlock(blockType) {
  return (n) => {
    const inputs = {};
    n.elts.forEach((e, i) => { inputs['ELT' + i] = { block: exprToBlock(e) }; });
    return { type: blockType, extraState: { n: n.elts.length }, inputs };
  };
}

// expr IR -> block
const EXPR_HANDLERS = {
  Name:     (n) => blk('ir_name',  { ID: n.id }),
  Constant: (n) => blk('ir_const', { VALUE: JSON.stringify(n.value) }),
  List:  eltsBlock('ir_list'),
  Tuple: eltsBlock('ir_tuple'),
  // Python has no empty set literal (Set([]) unparses to the unroundtrippable "{*()}").
  Set: (n) => {
    if (!n.elts || n.elts.length === 0) {
      throw new Error('irToBlockly: empty Set has no Python literal (use set())');
    }
    return eltsBlock('ir_set')(n);
  },
  // Dict pairs; a null key encodes ** unpacking ({**x}), so KEYi is omitted for it.
  Dict: (n) => {
    const inputs = {};
    n.keys.forEach((k, i) => {
      if (k !== null && k !== undefined) inputs['KEY' + i] = { block: exprToBlock(k) };
      inputs['VAL' + i] = { block: exprToBlock(n.values[i]) };
    });
    return { type: 'ir_dict', extraState: { n: n.keys.length }, inputs };
  },
  // Operators. The op is an enum NODE (e.g. {type:'Add'}) -> stored as a FIELD (dropdown),
  // never its own block. Operands/comparators are expression inputs. ast.unparse re-adds
  // any needed parentheses from the reconstructed tree, so precedence is preserved.
  BinOp: (n) => blk('ir_binop', { OP: n.op.type },
    { LEFT: { block: exprToBlock(n.left) }, RIGHT: { block: exprToBlock(n.right) } }),
  UnaryOp: (n) => blk('ir_unaryop', { OP: n.op.type },
    { OPERAND: { block: exprToBlock(n.operand) } }),
  BoolOp: (n) => {
    const inputs = {};
    n.values.forEach((v, i) => { inputs['VAL' + i] = { block: exprToBlock(v) }; });
    return { type: 'ir_boolop', fields: { OP: n.op.type }, extraState: { n: n.values.length }, inputs };
  },
  // a < b <= c: left + N (op, comparator) pairs. ops are FIELDs, comparators are inputs.
  Compare: (n) => {
    const fields = {};
    const inputs = { LEFT: { block: exprToBlock(n.left) } };
    n.ops.forEach((op, i) => {
      fields['OP' + i] = op.type;
      inputs['CMP' + i] = { block: exprToBlock(n.comparators[i]) };
    });
    return { type: 'ir_compare', fields, extraState: { n: n.ops.length }, inputs };
  },
  // Access / unpacking. attr is a plain identifier FIELD; subscript index/slice is an input.
  Attribute: (n) => blk('ir_attribute', { ATTR: n.attr }, { VALUE: { block: exprToBlock(n.value) } }),
  Subscript: (n) => blk('ir_subscript', {},
    { VALUE: { block: exprToBlock(n.value) }, SLICE: { block: exprToBlock(n.slice) } }),
  // Slice lower/upper/step are each optional (a[1:], a[::2], a[:]) -> omit absent inputs.
  Slice: (n) => {
    const inputs = {};
    if (n.lower !== null && n.lower !== undefined) inputs.LOWER = { block: exprToBlock(n.lower) };
    if (n.upper !== null && n.upper !== undefined) inputs.UPPER = { block: exprToBlock(n.upper) };
    if (n.step !== null && n.step !== undefined) inputs.STEP = { block: exprToBlock(n.step) };
    return blk('ir_slice', {}, inputs);
  },
  Starred: (n) => blk('ir_starred', {}, { VALUE: { block: exprToBlock(n.value) } }),
  // Lambda shares the arguments encoding; its body is a single expression.
  Lambda: (n) => {
    const inputs = {};
    const params = argsFragment(n.args, inputs);
    inputs.BODY = { block: exprToBlock(n.body) };
    return { type: 'ir_lambda', extraState: { params }, inputs };
  },
  // Call: func + N positional args (may include *a Starred) + M keywords. Each keyword is
  // (arg, value); arg=null encodes ** unpacking. arg names + arity live in extraState; the
  // keyword VALUES are KW* inputs. This is the Tier-B representation for any library call.
  Call: (n) => {
    const inputs = { FUNC: { block: exprToBlock(n.func) } };
    n.args.forEach((a, i) => { inputs['ARG' + i] = { block: exprToBlock(a) }; });
    const kw = [];
    n.keywords.forEach((k, i) => {
      kw.push(k.arg === null || k.arg === undefined ? null : k.arg);
      inputs['KW' + i] = { block: exprToBlock(k.value) };
    });
    return { type: 'ir_call', extraState: { nargs: n.args.length, kw }, inputs };
  },
  // SUGAR family (dedicated blocks; the desugar-as-feature pass is Phase 4). ast.unparse
  // re-adds any needed parentheses, so precedence is preserved without tracking it here.
  // Ternary: body if test else orelse.
  IfExp: (n) => blk('ir_ifexp', {}, {
    BODY: { block: exprToBlock(n.body) },
    TEST: { block: exprToBlock(n.test) },
    ORELSE: { block: exprToBlock(n.orelse) },
  }),
  ListComp: (n) => compBlock('ir_listcomp', n, false),
  SetComp: (n) => compBlock('ir_setcomp', n, false),
  GeneratorExp: (n) => compBlock('ir_genexp', n, false),
  DictComp: (n) => compBlock('ir_dictcomp', n, true),
  // Async/generator expressions. await/yield from take a required value; yield's value is
  // optional (bare `yield`). NamedExpr is the walrus `target := value` (target is a Name).
  Await: (n) => blk('ir_await', {}, { VALUE: { block: exprToBlock(n.value) } }),
  Yield: (n) => {
    const inputs = {};
    if (n.value !== null && n.value !== undefined) inputs.VALUE = { block: exprToBlock(n.value) };
    return blk('ir_yield', {}, inputs);
  },
  YieldFrom: (n) => blk('ir_yieldfrom', {}, { VALUE: { block: exprToBlock(n.value) } }),
  NamedExpr: (n) => blk('ir_namedexpr', {},
    { TARGET: { block: exprToBlock(n.target) }, VALUE: { block: exprToBlock(n.value) } }),
  // f-string. values is a mix of Constant string pieces and FormattedValue interpolations.
  JoinedStr: (n) => joinedStrBlock(n),
};

// f-string helpers. FormattedValue is a HELPER (no EXPR_HANDLERS entry / never dispatched at
// top level): it appears only inside a JoinedStr's values or a nested format_spec, so the
// JoinedStr builder special-cases it rather than routing through exprToBlock.
function jstrValueToBlock(v) {
  return v.type === 'FormattedValue' ? fvBlock(v) : exprToBlock(v);
}
function joinedStrBlock(n) {
  const inputs = {};
  (n.values || []).forEach((v, i) => { inputs['VAL' + i] = { block: jstrValueToBlock(v) }; });
  return { type: 'ir_joinedstr', extraState: { n: (n.values || []).length }, inputs };
}
// FormattedValue: the interpolated VALUE expr, an int conversion (-1 none / 115 !s / 114 !r /
// 97 !a) carried in extraState, and an optional format_spec which is itself a JoinedStr (SPEC).
function fvBlock(fv) {
  const inputs = { VALUE: { block: exprToBlock(fv.value) } };
  const hasSpec = fv.format_spec !== null && fv.format_spec !== undefined;
  if (hasSpec) inputs.SPEC = { block: joinedStrBlock(fv.format_spec) };
  return { type: 'ir_formattedvalue',
    extraState: { conv: fv.conversion, spec: hasSpec }, inputs };
}

// Comprehension family. The element (ELT, or KEY/VAL for dict) plus N generators. comprehension
// is a HELPER: each generator's target/iter are inputs; its filter count + is_async flag live in
// the gens fragment (extraState), with one IF<i>_<j> input per filter. Supports nested `for`
// (multiple generators) and chained `if` (multiple filters).
function compBlock(type, n, isDict) {
  const inputs = {};
  if (isDict) {
    inputs.KEY = { block: exprToBlock(n.key) };
    inputs.VAL = { block: exprToBlock(n.value) };
  } else {
    inputs.ELT = { block: exprToBlock(n.elt) };
  }
  const gens = (n.generators || []).map((g, i) => {
    inputs['TARGET' + i] = { block: exprToBlock(g.target) };
    inputs['ITER' + i] = { block: exprToBlock(g.iter) };
    (g.ifs || []).forEach((cond, j) => { inputs['IF' + i + '_' + j] = { block: exprToBlock(cond) }; });
    return { ifs: (g.ifs || []).length, async: !!g.is_async };
  });
  return { type, extraState: { gens }, inputs };
}

// stmt IR -> block
const STMT_HANDLERS = {
  // targets is a list (a = b = 1 has two) of *expressions* in Store context
  // (Name/Attribute/Subscript/Tuple/...). Model each as its own block input so the
  // mapping is lossless for every target form whose expr handler exists; unimplemented
  // target expr types defer (throw) rather than being silently dropped/corrupted.
  Assign: (n) => {
    const inputs = {};
    n.targets.forEach((t, i) => { inputs['TARGET' + i] = { block: exprToBlock(t) }; });
    inputs.VALUE = { block: exprToBlock(n.value) };
    // Variable arity -> extraState (not a field) so a REAL Blockly load rebuilds the
    // matching TARGET* inputs via loadExtraState before connections are restored.
    return { type: 'ir_assign', extraState: { n: n.targets.length }, inputs };
  },
  AugAssign: (n) => blk('ir_augassign', { OP: n.op.type },
    { TARGET: { block: exprToBlock(n.target) }, VALUE: { block: exprToBlock(n.value) } }),
  // Annotated assignment. value is optional (`x: int` has none). `simple` (0/1) marks an
  // unparenthesized bare-name target — preserved so `(x): int` round-trips.
  AnnAssign: (n) => {
    const inputs = {
      TARGET: { block: exprToBlock(n.target) },
      ANNOTATION: { block: exprToBlock(n.annotation) },
    };
    if (n.value !== null && n.value !== undefined) inputs.VALUE = { block: exprToBlock(n.value) };
    return { type: 'ir_annassign', extraState: { simple: n.simple }, inputs };
  },
  // Expression statement (e.g. a bare call print(x)): wraps a value-output expression block
  // as a statement block.
  Expr: (n) => blk('ir_exprstmt', {}, { VALUE: { block: exprToBlock(n.value) } }),
  // Control flow. body/orelse are statement-input stacks; orelse omitted when empty (no
  // else). elif is represented as a single nested If in orelse (ast.unparse re-collapses it).
  If: (n) => {
    const inputs = { TEST: { block: exprToBlock(n.test) }, BODY: stmtStack(n.body) };
    const orelse = stmtStack(n.orelse);
    if (orelse) inputs.ORELSE = orelse;
    return blk('ir_if', {}, inputs);
  },
  While: (n) => {
    const inputs = { TEST: { block: exprToBlock(n.test) }, BODY: stmtStack(n.body) };
    const orelse = stmtStack(n.orelse);
    if (orelse) inputs.ORELSE = orelse;
    return blk('ir_while', {}, inputs);
  },
  For: (n) => forBlock('ir_for', n),
  AsyncFor: (n) => forBlock('ir_asyncfor', n),
  Pass: () => blk('ir_pass', {}, {}),
  Break: () => blk('ir_break', {}, {}),
  Continue: () => blk('ir_continue', {}, {}),
  // del a, b — variable-arity targets (each a Store-context expr), like Assign's targets.
  Delete: (n) => {
    const inputs = {};
    n.targets.forEach((t, i) => { inputs['TARGET' + i] = { block: exprToBlock(t) }; });
    return { type: 'ir_delete', extraState: { n: n.targets.length }, inputs };
  },
  // raise / raise exc / raise exc from cause — both exprs optional (cause implies exc in
  // valid Python, so we never emit CAUSE without EXC).
  Raise: (n) => {
    const inputs = {};
    if (n.exc !== null && n.exc !== undefined) inputs.EXC = { block: exprToBlock(n.exc) };
    if (n.cause !== null && n.cause !== undefined) inputs.CAUSE = { block: exprToBlock(n.cause) };
    return blk('ir_raise', {}, inputs);
  },
  // assert test, msg — test required, msg optional.
  Assert: (n) => {
    const inputs = { TEST: { block: exprToBlock(n.test) } };
    if (n.msg !== null && n.msg !== undefined) inputs.MSG = { block: exprToBlock(n.msg) };
    return blk('ir_assert', {}, inputs);
  },
  // with ctx as var, ...: body — withitem is a HELPER. Per item: CTX<i> input always, VAR<i>
  // input when an `as` target is present (item.as flag in extraState). Body is mandatory.
  With: (n) => withBlock('ir_with', n),
  AsyncWith: (n) => withBlock('ir_asyncwith', n),
  // try/except/else/finally and except* (TryStar share an identical shape). ExceptHandler is
  // a HELPER: per handler TYPE<i> input (when an exception class is given) + HBODY<i> suite,
  // with the optional `as name` carried in extraState. orelse/finalbody are optional suites.
  Try: (n) => tryBlock('ir_try', n),
  TryStar: (n) => tryBlock('ir_trystar', n),
  // match subject: case <pattern> [if guard]: body ... — Match is the only DB node here;
  // match_case + the 8 pattern nodes are HELPERs encoded structurally in extraState. Embedded
  // expressions (MatchValue.value, MatchMapping.keys, MatchClass.cls) become C<i>E<k> inputs.
  Match: (n) => {
    const inputs = { SUBJECT: { block: exprToBlock(n.subject) } };
    const cases = (n.cases || []).map((c, i) => {
      let k = 0;
      const addExpr = (e) => { inputs['C' + i + 'E' + k] = { block: exprToBlock(e) }; return k++; };
      const pattern = encPattern(c.pattern, addExpr);
      const guard = c.guard !== null && c.guard !== undefined;
      if (guard) inputs['GUARD' + i] = { block: exprToBlock(c.guard) };
      const body = stmtStack(c.body);
      if (body) inputs['BODY' + i] = body;
      return { pattern, nexpr: k, guard };
    });
    return { type: 'ir_match', extraState: { cases }, inputs };
  },
  FunctionDef: (n) => funcDefBlock('ir_funcdef', n),
  AsyncFunctionDef: (n) => funcDefBlock('ir_asyncfuncdef', n),
  // ClassDef = FunctionDef's decorators/type_params/body plus Call-style bases + keywords.
  // bases are BASE* expr inputs; keywords (metaclass=..., **kw) mirror Call's kw encoding
  // (arg name, or null for **) with KW* value inputs. Body is a mandatory suite.
  ClassDef: (n) => {
    const inputs = {};
    (n.decorator_list || []).forEach((d, i) => { inputs['DEC' + i] = { block: exprToBlock(d) }; });
    const tparams = tparamsFragment(n.type_params, inputs);
    (n.bases || []).forEach((b, i) => { inputs['BASE' + i] = { block: exprToBlock(b) }; });
    const kw = [];
    (n.keywords || []).forEach((k, i) => {
      kw.push(k.arg === null || k.arg === undefined ? null : k.arg);
      inputs['KW' + i] = { block: exprToBlock(k.value) };
    });
    inputs.BODY = stmtStack(n.body);
    return { type: 'ir_classdef', fields: { NAME: n.name },
      extraState: { nbases: (n.bases || []).length, kw, tparams, ndec: (n.decorator_list || []).length },
      inputs };
  },
  Return: (n) => {
    const inputs = {};
    if (n.value !== null && n.value !== undefined) inputs.VALUE = { block: exprToBlock(n.value) };
    return blk('ir_return', {}, inputs);
  },
  // type X[T] = value (PEP-695). name is always a bare identifier (NAME field); type_params
  // reuse the shared tparams fragment (TypeVar/ParamSpec/TypeVarTuple HELPERs); value is an expr.
  TypeAlias: (n) => {
    const inputs = {};
    const tparams = tparamsFragment(n.type_params, inputs);
    inputs.VALUE = { block: exprToBlock(n.value) };
    return { type: 'ir_typealias', fields: { NAME: n.name.id }, extraState: { tparams }, inputs };
  },
  Global: (n) => blk('ir_global', { NAMES: n.names.join(', ') }, {}),
  Nonlocal: (n) => blk('ir_nonlocal', { NAMES: n.names.join(', ') }, {}),
  // alias is a HELPER node (no own block): each is encoded as "name" or "name as asname".
  // A dotted name (os.path) and identifier asname never contain ',' or ' as ', so the
  // comma-joined field round-trips losslessly. `import *` is just an alias named '*'.
  Import: (n) => blk('ir_import', { NAMES: aliasesToField(n.names) }, {}),
  // module + relative-import level (`from .. import x`) are folded into one MODULE field as
  // leading dots + module text: level=2,module='pkg' -> '..pkg'; level=1,module=None -> '.'.
  ImportFrom: (n) => blk('ir_importfrom', {
    MODULE: '.'.repeat(n.level || 0) + (n.module || ''),
    NAMES: aliasesToField(n.names),
  }, {}),
};

// Encode an alias list (Import/ImportFrom names) into the comma-joined NAMES field text.
function aliasesToField(names) {
  return (names || []).map((a) => (a.asname ? a.name + ' as ' + a.asname : a.name)).join(', ');
}

// Fail loud (never silently wrong) for a node with no block handler. The worklist is complete,
// so this is now a regression guard: it surfaces the node + its policy (UNCATEGORIZED for an
// unknown node, or PENDING if one is ever reintroduced) instead of emitting a wrong/empty block.
function noHandler(kind, type) {
  const status = NODE_POLICY[type] || 'UNCATEGORIZED';
  throw new Error(`irToBlockly: no ${kind} handler for ${type} (policy=${status})`);
}

function exprToBlock(n) {
  const h = EXPR_HANDLERS[n.type];
  if (!h) noHandler('expr', n.type);
  return h(n);
}

function stmtToBlock(n) {
  const h = STMT_HANDLERS[n.type];
  if (!h) noHandler('stmt', n.type);
  return h(n);
}

function irToBlockly(ir) {
  if (!ir || ir.type !== 'Module') throw new Error('irToBlockly: root must be Module');
  const top = ir.body.map(stmtToBlock);
  for (let i = 0; i < top.length - 1; i++) top[i].next = { block: top[i + 1] };
  return { blocks: { languageVersion: 0, blocks: top.length ? [top[0]] : [] } };
}

// AST node types this module can turn into blocks (for the raw=0 coverage gate).
const __handled = new Set([...Object.keys(EXPR_HANDLERS), ...Object.keys(STMT_HANDLERS)]);

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIR = Object.assign(api.BlockPyIR || {},
  { irToBlockly, exprToBlock, NODE_POLICY, OPTIONAL_DEPRECATED, __handled });
if (typeof module !== 'undefined') module.exports = api.BlockPyIR;
