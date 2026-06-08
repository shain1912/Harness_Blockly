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
// truly round-trips). Worklist is done when no PENDING remain.
const NODE_POLICY = {
  Module: 'ROOT',
  // statements — only Assign implemented so far; the rest are the worklist (PENDING)
  FunctionDef: 'DB', AsyncFunctionDef: 'PENDING', ClassDef: 'DB', Return: 'DB',
  Delete: 'PENDING', Assign: 'DB', AugAssign: 'DB', AnnAssign: 'DB', For: 'DB',
  AsyncFor: 'PENDING', While: 'DB', If: 'DB', With: 'PENDING', AsyncWith: 'PENDING',
  Match: 'PENDING', Raise: 'PENDING', Try: 'PENDING', TryStar: 'PENDING', Assert: 'PENDING',
  Import: 'PENDING', ImportFrom: 'PENDING', Global: 'DB', Nonlocal: 'DB', Pass: 'DB',
  Break: 'DB', Continue: 'DB', TypeAlias: 'PENDING', Expr: 'DB',
  // expressions — only Name/Constant implemented so far
  BoolOp: 'DB', NamedExpr: 'PENDING', BinOp: 'DB', UnaryOp: 'DB', Lambda: 'DB',
  Dict: 'DB', Set: 'DB', Await: 'PENDING', Yield: 'PENDING', YieldFrom: 'PENDING',
  Compare: 'DB', Call: 'DB', JoinedStr: 'PENDING', Constant: 'DB', Attribute: 'DB',
  Subscript: 'DB', Starred: 'DB', Name: 'DB', List: 'DB', Tuple: 'DB',
  // sugar (dedicated block + desugar pass) — all pending
  IfExp: 'PENDING', ListComp: 'PENDING', SetComp: 'PENDING', DictComp: 'PENDING', GeneratorExp: 'PENDING',
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
};

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
  For: (n) => {
    const inputs = {
      TARGET: { block: exprToBlock(n.target) },
      ITER: { block: exprToBlock(n.iter) },
      BODY: stmtStack(n.body),
    };
    const orelse = stmtStack(n.orelse);
    if (orelse) inputs.ORELSE = orelse;
    return blk('ir_for', {}, inputs);
  },
  Pass: () => blk('ir_pass', {}, {}),
  Break: () => blk('ir_break', {}, {}),
  Continue: () => blk('ir_continue', {}, {}),
  FunctionDef: (n) => {
    const inputs = {};
    const params = argsFragment(n.args, inputs);
    const tparams = tparamsFragment(n.type_params, inputs);
    (n.decorator_list || []).forEach((d, i) => { inputs['DEC' + i] = { block: exprToBlock(d) }; });
    if (n.returns !== null && n.returns !== undefined) inputs.RETURNS = { block: exprToBlock(n.returns) };
    inputs.BODY = stmtStack(n.body);
    return { type: 'ir_funcdef', fields: { NAME: n.name },
      extraState: { params, tparams, ndec: (n.decorator_list || []).length, ret: n.returns != null }, inputs };
  },
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
  Global: (n) => blk('ir_global', { NAMES: n.names.join(', ') }, {}),
  Nonlocal: (n) => blk('ir_nonlocal', { NAMES: n.names.join(', ') }, {}),
};

// Fail loud (never silently wrong) for a node we cannot yet turn into a block. The policy
// status makes the gap explicit: PENDING = on the worklist, not yet implemented.
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
