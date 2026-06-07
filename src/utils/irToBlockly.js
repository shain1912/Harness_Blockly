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
  FunctionDef: 'PENDING', AsyncFunctionDef: 'PENDING', ClassDef: 'PENDING', Return: 'PENDING',
  Delete: 'PENDING', Assign: 'DB', AugAssign: 'DB', AnnAssign: 'DB', For: 'PENDING',
  AsyncFor: 'PENDING', While: 'PENDING', If: 'PENDING', With: 'PENDING', AsyncWith: 'PENDING',
  Match: 'PENDING', Raise: 'PENDING', Try: 'PENDING', TryStar: 'PENDING', Assert: 'PENDING',
  Import: 'PENDING', ImportFrom: 'PENDING', Global: 'PENDING', Nonlocal: 'PENDING', Pass: 'PENDING',
  Break: 'PENDING', Continue: 'PENDING', TypeAlias: 'PENDING', Expr: 'PENDING',
  // expressions — only Name/Constant implemented so far
  BoolOp: 'DB', NamedExpr: 'PENDING', BinOp: 'DB', UnaryOp: 'DB', Lambda: 'PENDING',
  Dict: 'DB', Set: 'DB', Await: 'PENDING', Yield: 'PENDING', YieldFrom: 'PENDING',
  Compare: 'DB', Call: 'PENDING', JoinedStr: 'PENDING', Constant: 'DB', Attribute: 'PENDING',
  Subscript: 'PENDING', Starred: 'PENDING', Name: 'DB', List: 'DB', Tuple: 'DB',
  // sugar (dedicated block + desugar pass) — all pending
  IfExp: 'PENDING', ListComp: 'PENDING', SetComp: 'PENDING', DictComp: 'PENDING', GeneratorExp: 'PENDING',
  // helpers (rendered as part of a parent block)
  FormattedValue: 'HELPER', Slice: 'HELPER', comprehension: 'HELPER', ExceptHandler: 'HELPER',
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
