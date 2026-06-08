/* blocklyToIr.js — pure JS: Blockly workspace JSON -> canonical AST-IR.
 *
 * Inverse of irToBlockly.js. Produces a normalized ast-IR that pyAstBridge.irToPython
 * rebuilds and unparses. Intentionally NOT carried (ast.unparse, our only consumer,
 * ignores them; they are recomputable or irrelevant to emitted text):
 *   - Name/expr `ctx` (Load/Store/Del) — fully determined by position (target vs value)
 *   - `_loc`, Constant `kind`, `type_comment` — formatting/locations, not semantics
 * Comment preservation (Option 3) is layered later via parso (Phase 3), not here.
 */

// block -> a collection of element expressions (List/Tuple/Set).
function eltsToExpr(astType) {
  return (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const elts = [];
    for (let i = 0; i < n; i++) elts.push(blockToExpr(b.inputs['ELT' + i].block));
    return { type: astType, elts };
  };
}

const BLOCK_TO_EXPR = {
  ir_name:  (b) => ({ type: 'Name', id: b.fields.ID }),
  ir_const: (b) => ({ type: 'Constant', value: JSON.parse(b.fields.VALUE) }),
  ir_list:  eltsToExpr('List'),
  ir_tuple: eltsToExpr('Tuple'),
  ir_set:   eltsToExpr('Set'),
  ir_dict: (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const keys = [];
    const values = [];
    for (let i = 0; i < n; i++) {
      // a missing KEYi means a null key (** unpacking)
      keys.push(b.inputs['KEY' + i] ? blockToExpr(b.inputs['KEY' + i].block) : null);
      values.push(blockToExpr(b.inputs['VAL' + i].block));
    }
    return { type: 'Dict', keys, values };
  },
  // Operators: the OP field carries the enum node's type name; rebuild it as a bare node.
  ir_binop: (b) => ({ type: 'BinOp', left: blockToExpr(b.inputs.LEFT.block),
    op: { type: b.fields.OP }, right: blockToExpr(b.inputs.RIGHT.block) }),
  ir_unaryop: (b) => ({ type: 'UnaryOp', op: { type: b.fields.OP },
    operand: blockToExpr(b.inputs.OPERAND.block) }),
  ir_boolop: (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const values = [];
    for (let i = 0; i < n; i++) values.push(blockToExpr(b.inputs['VAL' + i].block));
    return { type: 'BoolOp', op: { type: b.fields.OP }, values };
  },
  ir_compare: (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const ops = [];
    const comparators = [];
    for (let i = 0; i < n; i++) {
      ops.push({ type: b.fields['OP' + i] });
      comparators.push(blockToExpr(b.inputs['CMP' + i].block));
    }
    return { type: 'Compare', left: blockToExpr(b.inputs.LEFT.block), ops, comparators };
  },
  ir_attribute: (b) => ({ type: 'Attribute', value: blockToExpr(b.inputs.VALUE.block), attr: b.fields.ATTR }),
  ir_subscript: (b) => ({ type: 'Subscript', value: blockToExpr(b.inputs.VALUE.block),
    slice: blockToExpr(b.inputs.SLICE.block) }),
  ir_slice: (b) => ({ type: 'Slice',
    lower: b.inputs.LOWER ? blockToExpr(b.inputs.LOWER.block) : null,
    upper: b.inputs.UPPER ? blockToExpr(b.inputs.UPPER.block) : null,
    step: b.inputs.STEP ? blockToExpr(b.inputs.STEP.block) : null }),
  ir_starred: (b) => ({ type: 'Starred', value: blockToExpr(b.inputs.VALUE.block) }),
  ir_lambda: (b) => ({ type: 'Lambda',
    args: fragmentToArgs((b.extraState && b.extraState.params) || [], b.inputs),
    body: blockToExpr(b.inputs.BODY.block) }),
  ir_call: (b) => {
    const nargs = (b.extraState && b.extraState.nargs) || 0;
    const kw = (b.extraState && b.extraState.kw) || [];
    const args = [];
    for (let i = 0; i < nargs; i++) args.push(blockToExpr(b.inputs['ARG' + i].block));
    const keywords = kw.map((name, i) => ({
      type: 'keyword', arg: name, value: blockToExpr(b.inputs['KW' + i].block),
    }));
    return { type: 'Call', func: blockToExpr(b.inputs.FUNC.block), args, keywords };
  },
  ir_ifexp: (b) => ({ type: 'IfExp',
    test: blockToExpr(b.inputs.TEST.block),
    body: blockToExpr(b.inputs.BODY.block),
    orelse: blockToExpr(b.inputs.ORELSE.block) }),
  ir_listcomp: (b) => compToIr('ListComp', b, false),
  ir_setcomp: (b) => compToIr('SetComp', b, false),
  ir_genexp: (b) => compToIr('GeneratorExp', b, false),
  ir_dictcomp: (b) => compToIr('DictComp', b, true),
  ir_await: (b) => ({ type: 'Await', value: blockToExpr(b.inputs.VALUE.block) }),
  ir_yield: (b) => ({ type: 'Yield', value: b.inputs.VALUE ? blockToExpr(b.inputs.VALUE.block) : null }),
  ir_yieldfrom: (b) => ({ type: 'YieldFrom', value: blockToExpr(b.inputs.VALUE.block) }),
  ir_namedexpr: (b) => ({ type: 'NamedExpr',
    target: blockToExpr(b.inputs.TARGET.block), value: blockToExpr(b.inputs.VALUE.block) }),
  ir_joinedstr: (b) => joinedStrToIr(b),
};

// f-string inverse. FormattedValue is a HELPER (no BLOCK_TO_EXPR entry): the JoinedStr handler
// branches on the block type rather than routing ir_formattedvalue through blockToExpr.
function jstrBlockToValue(b) {
  if (!b.inputs) b.inputs = {};
  return b.type === 'ir_formattedvalue' ? fvToIr(b) : blockToExpr(b);
}
function joinedStrToIr(b) {
  const n = (b.extraState && b.extraState.n) || 0;
  const values = [];
  for (let i = 0; i < n; i++) values.push(jstrBlockToValue(b.inputs['VAL' + i].block));
  return { type: 'JoinedStr', values };
}
function fvToIr(b) {
  const es = b.extraState || {};
  return { type: 'FormattedValue',
    value: blockToExpr(b.inputs.VALUE.block),
    conversion: typeof es.conv === 'number' ? es.conv : -1,
    format_spec: es.spec ? joinedStrToIr(b.inputs.SPEC.block) : null };
}

// Rebuild a comprehension expr from its gens fragment + ELT/KEY/VAL, TARGET<i>/ITER<i>, and
// IF<i>_<j> inputs. comprehension is a HELPER (no own block); is_async is carried as 0/1.
function compToIr(typeName, b, isDict) {
  const generators = ((b.extraState && b.extraState.gens) || []).map((g, i) => {
    const ifs = [];
    for (let j = 0; j < (g.ifs || 0); j++) ifs.push(blockToExpr(b.inputs['IF' + i + '_' + j].block));
    return { type: 'comprehension',
      target: blockToExpr(b.inputs['TARGET' + i].block),
      iter: blockToExpr(b.inputs['ITER' + i].block),
      ifs, is_async: g.async ? 1 : 0 };
  });
  if (isDict) {
    return { type: typeName, key: blockToExpr(b.inputs.KEY.block),
      value: blockToExpr(b.inputs.VAL.block), generators };
  }
  return { type: typeName, elt: blockToExpr(b.inputs.ELT.block), generators };
}

const BLOCK_TO_STMT = {
  ir_assign: (b) => {
    const n = (b.extraState && b.extraState.n) || 1;  // arity carried in extraState
    const targets = [];
    for (let i = 0; i < n; i++) targets.push(blockToExpr(b.inputs['TARGET' + i].block));
    return { type: 'Assign', targets, value: blockToExpr(b.inputs.VALUE.block) };
  },
  ir_augassign: (b) => ({ type: 'AugAssign', target: blockToExpr(b.inputs.TARGET.block),
    op: { type: b.fields.OP }, value: blockToExpr(b.inputs.VALUE.block) }),
  ir_annassign: (b) => ({ type: 'AnnAssign',
    target: blockToExpr(b.inputs.TARGET.block),
    annotation: blockToExpr(b.inputs.ANNOTATION.block),
    value: b.inputs.VALUE ? blockToExpr(b.inputs.VALUE.block) : null,   // optional
    simple: (b.extraState && typeof b.extraState.simple === 'number') ? b.extraState.simple : 1 }),
  ir_exprstmt: (b) => ({ type: 'Expr', value: blockToExpr(b.inputs.VALUE.block) }),
  ir_if: (b) => ({ type: 'If', test: blockToExpr(b.inputs.TEST.block),
    body: stmtListOrPass(b.inputs.BODY), orelse: stmtList(b.inputs.ORELSE) }),
  ir_while: (b) => ({ type: 'While', test: blockToExpr(b.inputs.TEST.block),
    body: stmtListOrPass(b.inputs.BODY), orelse: stmtList(b.inputs.ORELSE) }),
  ir_for: (b) => forToIr('For', b),
  ir_asyncfor: (b) => forToIr('AsyncFor', b),
  ir_pass: () => ({ type: 'Pass' }),
  ir_break: () => ({ type: 'Break' }),
  ir_continue: () => ({ type: 'Continue' }),
  ir_delete: (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const targets = [];
    for (let i = 0; i < n; i++) targets.push(blockToExpr(b.inputs['TARGET' + i].block));
    return { type: 'Delete', targets };
  },
  ir_raise: (b) => {
    const exc = b.inputs.EXC ? blockToExpr(b.inputs.EXC.block) : null;
    const cause = b.inputs.CAUSE ? blockToExpr(b.inputs.CAUSE.block) : null;
    // `raise from <cause>` with no exception is invalid Python (CPython rejects it at unparse).
    // The two inputs are independent in the UI, so guard rather than emit unroundtrippable IR.
    if (cause !== null && exc === null) {
      throw new Error('blocklyToIr: `raise ... from <cause>` requires an exception (EXC is empty)');
    }
    return { type: 'Raise', exc, cause };
  },
  ir_assert: (b) => ({ type: 'Assert',
    test: blockToExpr(b.inputs.TEST.block),
    msg: b.inputs.MSG ? blockToExpr(b.inputs.MSG.block) : null }),
  ir_with: (b) => withToIr('With', b),
  ir_asyncwith: (b) => withToIr('AsyncWith', b),
  ir_match: (b) => {
    const cases = ((b.extraState && b.extraState.cases) || []).map((c, i) => {
      const getExpr = (idx) => blockToExpr(b.inputs['C' + i + 'E' + idx].block);
      return { type: 'match_case',
        pattern: decPattern(c.pattern, getExpr),
        guard: c.guard ? blockToExpr(b.inputs['GUARD' + i].block) : null,
        body: stmtListOrPass(b.inputs['BODY' + i]) };
    });
    return { type: 'Match', subject: blockToExpr(b.inputs.SUBJECT.block), cases };
  },
  ir_try: (b) => tryToIr('Try', b),
  ir_trystar: (b) => tryToIr('TryStar', b),
  ir_funcdef: (b) => funcDefToIr('FunctionDef', b),
  ir_asyncfuncdef: (b) => funcDefToIr('AsyncFunctionDef', b),
  ir_classdef: (b) => {
    const es = b.extraState || {};
    const ndec = es.ndec || 0;
    const nbases = es.nbases || 0;
    const kw = es.kw || [];
    const decorator_list = [];
    for (let i = 0; i < ndec; i++) decorator_list.push(blockToExpr(b.inputs['DEC' + i].block));
    const bases = [];
    for (let i = 0; i < nbases; i++) bases.push(blockToExpr(b.inputs['BASE' + i].block));
    const keywords = kw.map((name, i) => ({
      type: 'keyword', arg: name, value: blockToExpr(b.inputs['KW' + i].block),
    }));
    return { type: 'ClassDef', name: b.fields.NAME,
      bases, keywords,
      body: stmtListOrPass(b.inputs.BODY),
      decorator_list,
      type_params: fragmentToTparams(es.tparams || [], b.inputs) };
  },
  ir_return: (b) => ({ type: 'Return', value: b.inputs.VALUE ? blockToExpr(b.inputs.VALUE.block) : null }),
  ir_typealias: (b) => ({ type: 'TypeAlias',
    name: { type: 'Name', id: b.fields.NAME },
    type_params: fragmentToTparams((b.extraState && b.extraState.tparams) || [], b.inputs),
    value: blockToExpr(b.inputs.VALUE.block) }),
  ir_global: (b) => ({ type: 'Global', names: b.fields.NAMES.split(', ') }),
  ir_nonlocal: (b) => ({ type: 'Nonlocal', names: b.fields.NAMES.split(', ') }),
  ir_import: (b) => ({ type: 'Import', names: fieldToAliases(b.fields.NAMES) }),
  ir_importfrom: (b) => {
    const raw = b.fields.MODULE || '';
    const level = raw.match(/^\.*/)[0].length;     // leading dots = relative-import depth
    const module = raw.slice(level) || null;       // remainder is the module ('' -> None)
    return { type: 'ImportFrom', module, names: fieldToAliases(b.fields.NAMES), level };
  },
};

// Decode the comma-joined NAMES field back into alias HELPER nodes (inverse of
// aliasesToField). Each clause is "name" or "name as asname"; `*` is a valid name.
function fieldToAliases(s) {
  return (s || '').split(',').map((p) => p.trim()).filter(Boolean).map((part) => {
    const m = part.split(/\s+as\s+/);
    return { type: 'alias', name: m[0].trim(), asname: m.length > 1 ? m[1].trim() : null };
  });
}

// Walk a statement-input stack (first block + next-chain) into an IR statement list.
function stmtList(inp) {
  const out = [];
  let cur = inp && inp.block;
  while (cur) { out.push(blockToStmt(cur)); cur = cur.next && cur.next.block; }
  return out;
}

// A mandatory suite (if/while/for body, def body, ...) cannot be empty in Python. A user
// can leave a body block empty, though; synthesize `pass` so block->Python stays valid
// (an empty `if x:` would be unparsable). Idempotent: round-trips back to the pass.
function stmtListOrPass(inp) {
  const list = stmtList(inp);
  return list.length ? list : [{ type: 'Pass' }];
}

// Rebuild a match pattern from its structural object (inverse of encPattern). getExpr(idx)
// resolves an embedded expression input by its stored index.
function decPattern(s, getExpr) {
  switch (s.p) {
    case 'V':   return { type: 'MatchValue', value: getExpr(s.e) };
    case 'S':   return { type: 'MatchSingleton', value: s.v };
    case 'Seq': return { type: 'MatchSequence', patterns: (s.items || []).map((x) => decPattern(x, getExpr)) };
    case 'Map': return { type: 'MatchMapping',
      keys: (s.keys || []).map(getExpr),
      patterns: (s.pats || []).map((x) => decPattern(x, getExpr)),
      rest: s.rest !== null && s.rest !== undefined ? s.rest : null };
    case 'Cls': return { type: 'MatchClass',
      cls: getExpr(s.cls),
      patterns: (s.pats || []).map((x) => decPattern(x, getExpr)),
      kwd_attrs: s.kwd_attrs || [],
      kwd_patterns: (s.kwd_pats || []).map((x) => decPattern(x, getExpr)) };
    case 'Star': return { type: 'MatchStar', name: s.name !== null && s.name !== undefined ? s.name : null };
    case 'As':  return { type: 'MatchAs',
      name: s.name !== null && s.name !== undefined ? s.name : null,
      pattern: s.sub !== null && s.sub !== undefined ? decPattern(s.sub, getExpr) : null };
    case 'Or':  return { type: 'MatchOr', patterns: (s.items || []).map((x) => decPattern(x, getExpr)) };
    default: throw new Error('blocklyToIr: unknown match pattern code ' + s.p);
  }
}

// For/AsyncFor share one shape; the block type carries async-ness.
function forToIr(typeName, b) {
  return { type: typeName, target: blockToExpr(b.inputs.TARGET.block),
    iter: blockToExpr(b.inputs.ITER.block),
    body: stmtListOrPass(b.inputs.BODY), orelse: stmtList(b.inputs.ORELSE) };
}

// FunctionDef/AsyncFunctionDef share one shape; the block type carries async-ness.
function funcDefToIr(typeName, b) {
  const params = (b.extraState && b.extraState.params) || [];
  const ndec = (b.extraState && b.extraState.ndec) || 0;
  const decorator_list = [];
  for (let i = 0; i < ndec; i++) decorator_list.push(blockToExpr(b.inputs['DEC' + i].block));
  return { type: typeName, name: b.fields.NAME,
    args: fragmentToArgs(params, b.inputs),
    body: stmtListOrPass(b.inputs.BODY),
    decorator_list,
    returns: b.inputs.RETURNS ? blockToExpr(b.inputs.RETURNS.block) : null,
    type_params: fragmentToTparams((b.extraState && b.extraState.tparams) || [], b.inputs) };
}

// Rebuild a With/AsyncWith from its item fragment + CTX<i>/VAR<i> inputs. withitem is a
// HELPER node: optional_vars is present only when the item bound `as` (the .as flag).
function withToIr(typeName, b) {
  const items = ((b.extraState && b.extraState.items) || []).map((it, i) => ({
    type: 'withitem',
    context_expr: blockToExpr(b.inputs['CTX' + i].block),
    optional_vars: it.as ? blockToExpr(b.inputs['VAR' + i].block) : null,
  }));
  return { type: typeName, items, body: stmtListOrPass(b.inputs.BODY) };
}

// Rebuild a Try/TryStar from its handler fragment + TYPE<i>/HBODY<i> inputs. ExceptHandler is
// a HELPER; its exception class uses the bridge-remapped `_field_type` key (dodging the `type`
// discriminator collision). Each handler suite is mandatory; orelse/finalbody are optional.
function tryToIr(typeName, b) {
  const handlers = ((b.extraState && b.extraState.handlers) || []).map((h, i) => {
    // `except*` (TryStar) always requires an exception type — a bare `except*:` is a
    // SyntaxError. The UI can produce a typeless handler, so guard rather than emit invalid IR.
    if (typeName === 'TryStar' && !h.type) {
      throw new Error('blocklyToIr: `except*` requires an exception type (bare except* is invalid Python)');
    }
    return {
      type: 'ExceptHandler',
      _field_type: h.type ? blockToExpr(b.inputs['TYPE' + i].block) : null,
      name: (h.name !== null && h.name !== undefined) ? h.name : null,
      body: stmtListOrPass(b.inputs['HBODY' + i]),
    };
  });
  const orelse = stmtList(b.inputs.ELSE);
  const finalbody = stmtList(b.inputs.FINALLY);
  // Python requires a try to have at least one except, or else a finally; and `else` is only
  // legal alongside an except. So the only valid handlerless form is finally-only (non-empty
  // finally, no else). Anything else (bare `try:`, `try...else` without except) is invalid —
  // fail loud rather than emit unparse-invalid code.
  if (handlers.length === 0 && (orelse.length > 0 || finalbody.length === 0)) {
    throw new Error('blocklyToIr: a try with no except handlers must have a finally and no else '
      + '(bare try / try-else without except is invalid Python)');
  }
  return { type: typeName, body: stmtListOrPass(b.inputs.BODY), handlers, orelse, finalbody };
}

// Rebuild PEP-695 type parameters from their fragment + TPB<i>/TPD<i> inputs.
function fragmentToTparams(tps, inputs) {
  return (tps || []).map((t, i) => {
    const node = { type: t.kind, name: t.name };
    if (t.kind === 'TypeVar') node.bound = t.bound ? blockToExpr(inputs['TPB' + i].block) : null;
    if (t.def) node.default_value = blockToExpr(inputs['TPD' + i].block);
    return node;
  });
}

// Rebuild a CPython `arguments` node from the unified param list + ANN<i>/DEF<i> inputs.
function fragmentToArgs(params, inputs) {
  const a = { type: 'arguments', posonlyargs: [], args: [], vararg: null,
    kwonlyargs: [], kw_defaults: [], kwarg: null, defaults: [] };
  params.forEach((p, i) => {
    const arg = { type: 'arg', arg: p.name,
      annotation: p.ann ? blockToExpr(inputs['ANN' + i].block) : null };
    const def = p.def ? blockToExpr(inputs['DEF' + i].block) : null;
    if (p.kind === 'posonly') { a.posonlyargs.push(arg); if (p.def) a.defaults.push(def); }
    else if (p.kind === 'arg') { a.args.push(arg); if (p.def) a.defaults.push(def); }
    else if (p.kind === 'vararg') a.vararg = arg;
    else if (p.kind === 'kwonly') { a.kwonlyargs.push(arg); a.kw_defaults.push(p.def ? def : null); }
    else if (p.kind === 'kwarg') a.kwarg = arg;
  });
  return a;
}

// Blockly omits `inputs` entirely when a block has no connected inputs (e.g. an empty
// slice a[:] -> ir_slice with no LOWER/UPPER/STEP). Normalize so handlers can always read
// b.inputs.X safely (absent -> undefined, handled by their optional guards).
function blockToExpr(b) {
  if (!b.inputs) b.inputs = {};
  const h = BLOCK_TO_EXPR[b.type];
  if (!h) throw new Error('blocklyToIr: no expr handler for ' + b.type);
  return h(b);
}

function blockToStmt(b) {
  if (!b.inputs) b.inputs = {};
  const h = BLOCK_TO_STMT[b.type];
  if (!h) throw new Error('blocklyToIr: no stmt handler for ' + b.type);
  return h(b);
}

function blocklyToIr(ws) {
  const body = [];
  // A workspace may hold multiple disconnected top-level stacks; Blockly serializes each
  // as an entry in blocks.blocks. Convert every stack (then its next-chain) so none are
  // dropped — starting only at blocks[0] would silently lose the rest.
  const tops = (ws && ws.blocks && ws.blocks.blocks) || [];
  for (const top of tops) {
    let cur = top;
    while (cur) {
      body.push(blockToStmt(cur));
      cur = cur.next && cur.next.block;
    }
  }
  // type_ignores is a sequence field ast.unparse iterates over; it must be [] not None.
  // Each node handler likewise emits the structural list fields its ast node requires.
  return { type: 'Module', body, type_ignores: [] };
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIR = Object.assign(api.BlockPyIR || {}, { blocklyToIr, blockToExpr });
if (typeof module !== 'undefined') module.exports = api.BlockPyIR;
