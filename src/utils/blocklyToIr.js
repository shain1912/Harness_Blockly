/* blocklyToIr.js — pure JS: Blockly workspace JSON -> canonical AST-IR.
 *
 * Inverse of irToBlockly.js. Produces a normalized ast-IR that pyAstBridge.irToPython
 * rebuilds and unparses. Intentionally NOT carried (ast.unparse, our only consumer,
 * ignores them; they are recomputable or irrelevant to emitted text):
 *   - Name/expr `ctx` (Load/Store/Del) — fully determined by position (target vs value)
 *   - `_loc`, `type_comment` — formatting/locations, not semantics
 * Constant `kind` (the `u''` prefix) IS semantics at the ast.dump level, so ir_str carries it
 * in extraState and this module restores it (see the ir_str handler).
 * Comments ARE carried (Phase 3, Option 3): a statement block's comment is restored from its
 * `block.data` (and live comment bubble) into `_comments` by readBlockComments; pyAstBridge's
 * _CommentUnparser re-emits it. The bubble is the source of truth (a deleted bubble => no comment).
 */

// Parse an ir_const VALUE field. Accepts PYTHON literals (None/True/False, numbers) shown on the block
// face AND legacy JSON (null/true/false, numbers, {__py__:…} for bytes/complex) from older snapshots.
// Inverse of irToBlockly.pyConstText — keeps the None/True/False round-trip lossless.
function pyConstValue(t) {
  const s = String(t == null ? '' : t).trim();
  if (s === 'None' || s === 'null' || s === '') return null;
  if (s === 'True' || s === 'true') return true;
  if (s === 'False' || s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(s)) {
    const f = parseFloat(s);
    // An integral-valued float face (1.0, -0.0, 1e10) must stay a FLOAT — carry it as a tag so it
    // doesn't collapse to an int through JS/JSON on the way back to Python (1.0 would become 1).
    if (Number.isInteger(f) && (s.indexOf('.') >= 0 || /[eE]/.test(s))) return { __py__: 'float', repr: s };
    if (Object.is(f, -0)) return { __py__: 'float', repr: '-0.0' };
    return f;
  }
  // {__py__:…} tags (bytes/complex/float(inf)/big int) and legacy JSON faces parse here. A bare
  // token that is none of the above (a student typing `speed` or `inf`) is NOT silently a string —
  // fail loud rather than emit the wrong constant.
  try { return JSON.parse(s); } catch (_) {
    throw new Error('blocklyToIr: ir_const has an unrecognized literal "' + s
      + '" — numbers/None/True/False only; use the string block for text');
  }
}

// A single Python identifier. \p{L}/\p{N} keeps PEP-3131 Unicode identifiers (Korean names,
// which the 초/중/고 audience uses) valid; keywords are out of scope (ast.unparse never checks).
const IDENT_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;
function isIdent(s) { return typeof s === 'string' && IDENT_RE.test(s); }
// A dotted module path (os.path): every segment an identifier.
function isDottedName(s) { return String(s).split('.').every(isIdent); }

// block -> a collection of element expressions (List/Tuple/Set).
function eltsToExpr(astType) {
  return (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const elts = [];
    for (let i = 0; i < n; i++) elts.push(blockToExpr(b.inputs['ELT' + i].block));
    return { type: astType, elts };
  };
}

// Variable id -> name map for the current blocklyToIr() pass (from the workspace `variables`).
let _varMap = null;

// "cv2.imread" / "os.path.join" -> the Attribute/Name chain it denotes.
function dottedToExpr(s) {
  const parts = String(s).split('.');
  let e = { type: 'Name', id: parts[0] };
  for (let i = 1; i < parts.length; i++) e = { type: 'Attribute', value: e, attr: parts[i] };
  return e;
}

const BLOCK_TO_EXPR = {
  // FieldVariable serializes as { ID: { id } }; resolve to the variable name via _varMap. A legacy
  // string field (older snapshots / non-variable Name) is used directly.
  ir_name:  (b) => {
    const f = b.fields.ID;
    const id = (f && typeof f === 'object')
      ? ((_varMap && _varMap[f.id] != null) ? _varMap[f.id] : f.id)
      : f;
    return { type: 'Name', id };
  },
  ir_const: (b) => ({ type: 'Constant', value: pyConstValue(b.fields.VALUE) }),
  // The rounded string block: its TEXT field is the raw content (no JSON quoting). A u-string
  // prefix (Constant kind='u') is carried in extraState so `u'abc'` stays ast.dump-identical.
  ir_str: (b) => {
    const node = { type: 'Constant', value: b.fields.TEXT == null ? '' : String(b.fields.TEXT) };
    if (b.extraState && b.extraState.kind) node.kind = b.extraState.kind;
    return node;
  },
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
  ir_attribute: (b) => {
    const dotted = b.extraState && b.extraState.dotted;
    if (dotted) return dottedToExpr(dotted);   // fixed module attribute (cv2.imread)
    // attr is a fixed label in extraState; fall back to the legacy ATTR field for old snapshots.
    const attr = (b.extraState && b.extraState.attr) || (b.fields && b.fields.ATTR);
    return { type: 'Attribute', value: blockToExpr(b.inputs.VALUE.block), attr };
  },
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
    // Keyword names are user-editable text (KWNAME fields): a non-identifier (`f(a b=1)`) or a
    // repeated name (`f(x=1, x=2)`) is a SyntaxError, so guard rather than emit invalid IR.
    // null entries (** unpacking) are exempt — `f(**a, **b)` is valid Python.
    const seenKw = new Set();
    const keywords = kw.map((name, i) => {
      if (name !== null && name !== undefined) {
        if (!isIdent(name)) {
          throw new Error('blocklyToIr: ir_call keyword name "' + name
            + '" is not a valid Python identifier');
        }
        if (seenKw.has(name)) {
          throw new Error('blocklyToIr: ir_call repeats keyword argument "' + name
            + '" (keyword argument repeated is invalid Python)');
        }
        seenKw.add(name);
      }
      return { type: 'keyword', arg: name, value: blockToExpr(b.inputs['KW' + i].block) };
    });
    // Callee shapes: extraState.funcName -> a bare Name (plain id) or rebuilt Attribute chain
    // (dotted module, cv2.imread); extraState.method -> <RECV variable>.method (folded var-method);
    // otherwise the FUNC input expression.
    const fn = b.extraState && b.extraState.funcName;
    const method = b.extraState && b.extraState.method;
    let func;
    if (fn !== null && fn !== undefined) {
      func = String(fn).includes('.') ? dottedToExpr(fn) : { type: 'Name', id: fn };
    } else if (method !== null && method !== undefined) {
      const rf = b.fields && b.fields.RECV;
      const recvId = (rf && typeof rf === 'object')
        ? ((_varMap && _varMap[rf.id] != null) ? _varMap[rf.id] : rf.id)
        : rf;
      func = { type: 'Attribute', value: { type: 'Name', id: recvId }, attr: method };
    } else {
      func = blockToExpr(b.inputs.FUNC.block);
    }
    return { type: 'Call', func, args, keywords };
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
  normInputs(b);   // FormattedValue is a HELPER: it never reaches the dispatcher, so normalize here too
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
  // A call in statement position (stmt-mode ir_call) lowers to an Expr(Call) — same as wrapping it
  // in ir_exprstmt, but it's a single stack block. (BLOCK_TO_EXPR.ir_call builds the call itself.)
  ir_call: (b) => ({ type: 'Expr', value: BLOCK_TO_EXPR.ir_call(b) }),
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
    return { type: 'ClassDef', name: checkName('ir_classdef', b.fields.NAME),
      bases, keywords,
      body: stmtListOrPass(b.inputs.BODY),
      decorator_list,
      type_params: fragmentToTparams(es.tparams || [], b.inputs) };
  },
  ir_return: (b) => ({ type: 'Return', value: b.inputs.VALUE ? blockToExpr(b.inputs.VALUE.block) : null }),
  ir_typealias: (b) => ({ type: 'TypeAlias',
    name: { type: 'Name', id: checkName('ir_typealias', b.fields.NAME) },
    type_params: fragmentToTparams((b.extraState && b.extraState.tparams) || [], b.inputs),
    value: blockToExpr(b.inputs.VALUE.block) }),
  ir_global: (b) => ({ type: 'Global', names: fieldToNames(b.fields.NAMES, 'ir_global') }),
  ir_nonlocal: (b) => ({ type: 'Nonlocal', names: fieldToNames(b.fields.NAMES, 'ir_nonlocal') }),
  ir_import: (b) => ({ type: 'Import', names: fieldToAliases(b.fields.NAMES, 'ir_import') }),
  ir_importfrom: (b) => {
    const raw = String(b.fields.MODULE == null ? '' : b.fields.MODULE).trim();
    const level = raw.match(/^\.*/)[0].length;     // leading dots = relative-import depth
    const module = raw.slice(level) || null;       // remainder is the module ('' -> None)
    // MODULE is free text: `from  import x` (no module, no dots) and `from a;b import x` are
    // SyntaxErrors — fail loud rather than lower them verbatim. Leading dots stay legal
    // (`from ..pkg import x` keeps round-tripping).
    if (module === null && level === 0) {
      throw new Error('blocklyToIr: ir_importfrom MODULE is empty — need a module name '
        + 'or leading dots for a relative import');
    }
    if (module !== null && !isDottedName(module)) {
      throw new Error('blocklyToIr: ir_importfrom MODULE "' + raw
        + '" is not a valid (dotted) module name');
    }
    return { type: 'ImportFrom', module, names: fieldToAliases(b.fields.NAMES, 'ir_importfrom'), level };
  },
};

// Guard an editable definition-name field (def/class/type). `def my func():` and `class a;b:`
// are SyntaxErrors ast.unparse will happily emit — fail loud at lowering instead.
function checkName(blockType, name) {
  if (!isIdent(name)) {
    throw new Error('blocklyToIr: ' + blockType + ' NAME "' + name
      + '" is not a valid Python identifier');
  }
  return name;
}

// Decode a global/nonlocal NAMES field: comma-separated identifiers, no empties. Free text
// lowered verbatim could inject structure (`x; boom()`) or emit `global x,` — fail loud.
function fieldToNames(s, blockType) {
  const raw = String(s == null ? '' : s);
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length === 1 && parts[0] === '') {
    throw new Error('blocklyToIr: ' + blockType + ' NAMES is empty — list at least one variable name');
  }
  return parts.map((p) => {
    if (!isIdent(p)) {
      throw new Error('blocklyToIr: ' + blockType + ' NAMES contains "' + p
        + '" — each entry must be a single identifier (comma-separated)');
    }
    return p;
  });
}

// Decode the comma-joined NAMES field back into alias HELPER nodes (inverse of aliasesToField).
// Each clause is "name" or "name as asname". ir_import allows dotted names (import os.path);
// ir_importfrom allows plain identifiers, or a lone `*`. Anything else (a `;`, an emptied
// field, a stray comma) would be lowered verbatim into broken/injected code — fail loud.
function fieldToAliases(s, blockType) {
  const raw = String(s == null ? '' : s);
  const isImport = blockType === 'ir_import';
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length === 1 && parts[0] === '') {
    throw new Error('blocklyToIr: ' + blockType + ' NAMES is empty — list at least one name');
  }
  return parts.map((part) => {
    const bad = (why) => new Error('blocklyToIr: ' + blockType + ' NAMES contains "' + part
      + '" — ' + why);
    if (part === '') throw bad('empty entry (stray comma?)');
    const m = part.split(/\s+as\s+/);
    if (m.length > 2) throw bad('more than one "as"');
    const name = m[0].trim();
    const asname = m.length > 1 ? m[1].trim() : null;
    if (name === '*') {
      // `from x import *` is one lone alias: import * / * as y / *, y are all SyntaxErrors.
      if (isImport) throw bad('`import *` is not valid Python');
      if (asname !== null) throw bad('`* as name` is not valid Python');
      if (parts.length > 1) throw bad('`*` cannot be combined with other names');
    } else if (isImport ? !isDottedName(name) : !isIdent(name)) {
      throw bad(isImport ? 'expected a (dotted) module name, optionally "as <name>"'
        : 'expected an identifier, optionally "as <name>"');
    }
    if (asname !== null && !isIdent(asname)) throw bad('"as ' + asname + '" is not a valid identifier');
    return { type: 'alias', name, asname };
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
  return { type: typeName, name: checkName(b.type, b.fields.NAME),
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
//
// Toolbox default children are placed on an input as a *shadow*, which Blockly serializes
// under `inputs.X.shadow` (not `.block`) until the user drops a real block on top. Our
// handlers only read `.block`, so collapse a shadow-only input into its block here (a real
// `block` always wins over the `shadow`). Done once per block at the dispatcher entry; child
// blocks normalize when they in turn reach blockToExpr/blockToStmt. Mutates the input objects
// in place — fine, the serialized snapshot is a throwaway passed straight to blocklyToIr.
function normInputs(b) {
  if (!b.inputs) { b.inputs = {}; return b; }
  for (const key of Object.keys(b.inputs)) {
    const inp = b.inputs[key];
    if (inp && !inp.block && inp.shadow) inp.block = inp.shadow;
  }
  return b;
}

// Phase 5: a registered Tier-A library block lowers to the SAME Call IR as the Tier-B
// ir_call/ir_attribute path (module.func(args) or func(args)). Returns null for a non-library
// (truly unknown) type so the caller emits its canonical "no handler" error. Function
// declaration → hoisted, so the forward reference to blockToExpr is fine.
function lowerLibBlock(b) {
  const reg = (typeof window !== 'undefined' ? window : global).BlockPyLibRegistry;
  const spec = (reg && typeof reg.getLibSpec === 'function') ? reg.getLibSpec(b.type) : null;
  if (!spec) return null;
  const args = (spec.argNames || []).map((_, i) => blockToExpr(b.inputs['ARG' + i].block));
  if (spec.method) {
    // instance method: ARG0 is the receiver object -> `<ARG0>.func(<ARG1..>)` (not module.func(allArgs))
    return { type: 'Call', func: { type: 'Attribute', value: args[0], attr: spec.func }, args: args.slice(1), keywords: [] };
  }
  const func = spec.module
    ? { type: 'Attribute', value: { type: 'Name', id: spec.module }, attr: spec.func }
    : { type: 'Name', id: spec.func };
  return { type: 'Call', func, args, keywords: [] };
}

function blockToExpr(b) {
  normInputs(b);
  const h = BLOCK_TO_EXPR[b.type];
  if (h) return h(b);
  const lib = lowerLibBlock(b);                 // Phase 5: Tier-A library block -> bare Call
  if (lib) return lib;
  throw new Error('blocklyToIr: no expr handler for ' + b.type);
}

function blockToStmt(b) {
  normInputs(b);
  const h = BLOCK_TO_STMT[b.type];
  let stmt;
  if (h) {
    stmt = h(b);
  } else {
    const lib = lowerLibBlock(b);               // Phase 5: statement-form Tier-A block -> Expr(Call)
    if (!lib) throw new Error('blocklyToIr: no stmt handler for ' + b.type);
    stmt = { type: 'Expr', value: lib };
  }
  const cm = readBlockComments(b);
  if (cm) stmt._comments = cm;
  return stmt;
}

// A native comment bubble holds human text; our IR stores raw Python comment tokens that the
// unparser emits verbatim. Normalize each adopted bubble line to a `# ...` comment so edited /
// freshly-added bubbles round-trip as comments, not as code.
const toCommentLines = (text) => text
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '')
  .map((l) => (l.startsWith('#') ? l : '# ' + l));

// Restore structured comments from the block's serialized `data`. If the live bubble text was
// edited away from the stored rendering, adopt the edited text as leading (Option 3 simplification).
function readBlockComments(b) {
  let stored = null;
  if (typeof b.data === 'string' && b.data) {
    try { stored = JSON.parse(b.data); } catch (_) { stored = null; }
  }
  const bubble = b.icons && b.icons.comment ? b.icons.comment.text : undefined;
  // The live comment bubble is the source of truth: if it was deleted (no icons.comment), the
  // comment is gone even though stale `data` may remain. Do not resurrect it.
  if (typeof bubble !== 'string') return null;
  // Reuse irToBlockly's renderComments (exported on BlockPyIR). irToBlockly loads before
  // blocklyToIr in both main.jsx and the test requires, and readBlockComments runs only at
  // conversion time (post-load), so BlockPyIR.renderComments is defined by call time. No duplication.
  const render = (typeof window !== 'undefined' ? window : global).BlockPyIR.renderComments;
  if (typeof bubble === 'string' && stored && bubble !== render(stored)) {
    // user edited the bubble -> normalize to leading Python comment lines
    const leading = toCommentLines(bubble);
    return leading.length ? { leading, trailing: null, after: [] } : null;
  }
  if (typeof bubble === 'string' && !stored && bubble.trim() !== '') {
    // bubble present with no stored data (user added a comment to a fresh block)
    const leading = toCommentLines(bubble);
    return leading.length ? { leading, trailing: null, after: [] } : null;
  }
  return stored;
}

// Block types valid ONLY inside a parent (a subscript's slice, a call/assignment target): as a
// bare top-level statement they unparse to invalid Python (`:`, `*args`). The toolbox exposes
// ir_slice/ir_starred so they can be dropped INTO a parent, but a disconnected one on the canvas
// is an incomplete fragment — skip it rather than emit invalid code; it converts correctly once
// connected. Keyed by BLOCK type (not IR type) so the skip happens BEFORE blockToExpr runs: an
// ir_starred from Convert (e.g. `f(*args)`) has no shadow on its VALUE input, so a user can leave
// it empty, and blockToExpr would throw on the missing child — stalling the WHOLE workspace —
// before any IR-type check could fire. ir_slice/ir_starred map 1:1 to Slice/Starred, so the
// block-type test is exact.
const CONTEXT_ONLY_BLOCKS = new Set(['ir_slice', 'ir_starred']);

// A top-level block is normally a statement. But the toolbox exposes expression-output blocks
// (ir_name, ir_binop, a call, ...) too, and a user can drag one onto the canvas and leave it
// disconnected. In Python a bare expression on its own line IS an `Expr` statement, so wrap it
// — throwing here would break code generation for the WHOLE workspace (regenerate() catches and
// logs), not just that one dangling block, stalling the editor until it is removed. Returns null
// for a context-only orphan (caller skips it).
function topToStmt(b) {
  if (BLOCK_TO_STMT[b.type]) return blockToStmt(b);
  if (BLOCK_TO_EXPR[b.type]) {
    if (CONTEXT_ONLY_BLOCKS.has(b.type)) return null;     // incomplete fragment until connected
    const stmt = { type: 'Expr', value: blockToExpr(b) };
    const cm = readBlockComments(b);
    if (cm) stmt._comments = cm;
    return stmt;
  }
  return blockToStmt(b);   // neither: emit the canonical "no stmt handler" error
}

function blocklyToIr(ws) {
  // Build the variable id -> name map so ir_name's FieldVariable ({ID:{id}}) resolves to the name.
  _varMap = {};
  if (ws && Array.isArray(ws.variables)) {
    for (const v of ws.variables) if (v && v.id != null) _varMap[v.id] = v.name;
  }
  const body = [];
  // A workspace may hold multiple disconnected top-level stacks; Blockly serializes each
  // as an entry in blocks.blocks. Convert every stack (then its next-chain) so none are
  // dropped — starting only at blocks[0] would silently lose the rest.
  //
  // Deep-clone first: normInputs (and the handlers) collapse shadow defaults by mutating input
  // objects in place. The caller's snapshot is NOT a throwaway in production — BlocklyEditor's
  // regenerate() hands the SAME object to onSnapshotChange, which persists it in
  // blocklySnapshotRef and reloads it on tab-switch / remount. Mutating it would harden shadow
  // defaults (inp.shadow) into real blocks (inp.block) across one recovery cycle. Cloning here
  // confines all downstream mutation to a private copy, so the snapshot we convert is the
  // snapshot we (don't) keep.
  const tops = (ws && ws.blocks && ws.blocks.blocks)
    ? JSON.parse(JSON.stringify(ws.blocks.blocks))
    : [];
  for (const top of tops) {
    let cur = top;
    while (cur) {
      const stmt = topToStmt(cur);
      if (stmt) body.push(stmt);
      cur = cur.next && cur.next.block;
    }
  }
  // type_ignores is a sequence field ast.unparse iterates over; it must be [] not None.
  // Each node handler likewise emits the structural list fields its ast node requires.
  const mod = { type: 'Module', body, type_ignores: [] };
  // Module-level comments (a comment-only program has no statement to anchor them to). The
  // inverse irToBlockly carries them under the top-level `blockpyModule` workspace key (kept
  // across a real Blockly save by the serializer plugin registered in irBlocks.js).
  const mc = ws && ws.blockpyModule && ws.blockpyModule.comments;
  if (mc) mod._comments = mc;
  return mod;
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIR = Object.assign(api.BlockPyIR || {}, { blocklyToIr, blockToExpr, isIdent });
if (typeof module !== 'undefined') module.exports = api.BlockPyIR;
