/* irToolbox.js — the drag-to-edit toolbox, built from ir_* blocks (side-effect load).
 *
 * After the IR engine swap (commit 651e2be) the legacy XML toolbox was retired because
 * blocklyToIr only understands ir_* types. This restores the palette: every standalone ir_*
 * block, grouped by worklist family, exposed so a user can drag a fresh block onto the canvas
 * (not only reach blocks via Python -> Convert).
 *
 * Single source of truth: IR_TOOLBOX_TABLE below. buildIrToolbox() compiles it to a Blockly
 * `categoryToolbox` JSON object. We use JSON (not hand-written XML) because most ir_* blocks
 * are mutator-driven (variable arity); a valid default `extraState` + shadow children are far
 * cleaner as JSON than as XML <mutation> nodes.
 *
 * Default inputs: a freshly-dragged block must convert to valid Python immediately, so each
 * REQUIRED value/expr input carries a shadow default child. Statement *bodies* are left empty
 * (blocklyToIr's stmtListOrPass synthesizes `pass`); only value/expr inputs get shadows.
 * blocklyToIr collapses a shadow-only input into its block on read, so the defaults round-trip.
 *
 * HELPER-only blocks valid solely inside a parent (ir_formattedvalue, inside ir_joinedstr) are
 * intentionally NOT exposed; the browser coverage test asserts this is the only omission.
 */

// --- shadow-child helpers (the JSON Blockly expects for a default input) ---
const name = (id) => ({ shadow: { type: 'ir_name', fields: { ID: id } } });
// value is JSON-encoded to match ir_const's field contract (blockToExpr does JSON.parse).
const konst = (jsonValue) => ({ shadow: { type: 'ir_const', fields: { VALUE: JSON.stringify(jsonValue) } } });
// A rounded string shadow (ir_str holds raw text, no JSON quoting).
const text = (s) => ({ shadow: { type: 'ir_str', fields: { TEXT: s } } });
// A fixed built-in function block: ir_call with a non-editable funcName label + arg shadows.
// stmt=true makes it a command (stack) block (print); otherwise a reporter (len, range, …).
const builtin = (funcName, args, stmt) => {
  const inputs = {};
  (args || []).forEach((a, i) => { inputs['ARG' + i] = a; });
  const extraState = { nargs: (args || []).length, kw: [], funcName };
  if (stmt) extraState.stmt = true;
  const entry = { type: 'ir_call', extraState };
  if (args && args.length) entry.inputs = inputs;
  return entry;
};

// A comprehension generator/element default: [elt] for x in items
const COMP_GENS = { gens: [{ ifs: 0, async: false }] };

// The closed family table. Order = worklist order (common -> rare). Each block entry is
// { type, extraState?, fields?, inputs? }; extraState/inputs describe the default drag-out form.
const IR_TOOLBOX_TABLE = [
  { name: 'Values', colour: '#5b80a5', blocks: [
    { type: 'ir_name' },
    { type: 'ir_str' },                                   // rounded text string (type content directly)
    { type: 'ir_const' },
  ] },
  { name: 'Collections', colour: '#4a90a4', blocks: [
    { type: 'ir_list', extraState: { n: 0 } },
    { type: 'ir_tuple', extraState: { n: 0 } },
    { type: 'ir_set', extraState: { n: 1 }, inputs: { ELT0: konst(0) } },
    { type: 'ir_dict', extraState: { n: 0 } },
  ] },
  { name: 'Operators', colour: '#5b67a5', blocks: [
    { type: 'ir_binop', inputs: { LEFT: konst(0), RIGHT: konst(0) } },
    { type: 'ir_unaryop', inputs: { OPERAND: konst(0) } },
    { type: 'ir_boolop', extraState: { n: 2 }, inputs: { VAL0: konst(true), VAL1: konst(false) } },
    { type: 'ir_compare', extraState: { n: 1 }, inputs: { LEFT: konst(0), CMP0: konst(0) } },
  ] },
  { name: 'Access', colour: '#a07a4a', blocks: [
    { type: 'ir_attribute', inputs: { VALUE: name('obj') } },
    { type: 'ir_subscript', inputs: { VALUE: name('obj'), SLICE: konst(0) } },
    { type: 'ir_slice' },                                  // bounds optional (a[:])
    { type: 'ir_starred', inputs: { VALUE: name('args') } },
  ] },
  { name: 'Variables', colour: '#5b5ba5', button: { text: 'Create variable…', callbackkey: 'IR_CREATE_VARIABLE' }, blocks: [
    { type: 'ir_assign', extraState: { n: 1 }, inputs: { TARGET0: name('x'), VALUE: konst(0) } },
    { type: 'ir_augassign', inputs: { TARGET: name('x'), VALUE: konst(1) } },
    { type: 'ir_annassign', inputs: { TARGET: name('x'), ANNOTATION: name('int') } },
    { type: 'ir_namedexpr', inputs: { TARGET: name('x'), VALUE: konst(0) } },
    { type: 'ir_delete', extraState: { n: 1 }, inputs: { TARGET0: name('x') } },
    { type: 'ir_global' },
    { type: 'ir_nonlocal' },
  ] },
  { name: 'Control flow', colour: '#a0734a', blocks: [
    { type: 'ir_if', inputs: { TEST: konst(true) } },
    { type: 'ir_if', extraState: { hasElse: true }, inputs: { TEST: konst(true) } },   // if / else
    { type: 'ir_while', inputs: { TEST: konst(true) } },
    { type: 'ir_for', inputs: { TARGET: name('i'), ITER: name('items') } },
    { type: 'ir_for', extraState: { hasElse: true }, inputs: { TARGET: name('i'), ITER: name('items') } },  // for / else
    { type: 'ir_break' },
    { type: 'ir_continue' },
    { type: 'ir_pass' },
  ] },
  { name: 'Functions', colour: '#9a6a8a', blocks: [
    { type: 'ir_funcdef' },                                // def f(): pass
    { type: 'ir_lambda', inputs: { BODY: konst(0) } },
    { type: 'ir_return' },                                 // bare `return`
    { type: 'ir_call', extraState: { nargs: 0, kw: [] }, inputs: { FUNC: name('func') } },                       // call as a value (reporter)
    { type: 'ir_call', extraState: { nargs: 1, kw: [], stmt: true }, inputs: { FUNC: name('func'), ARG0: name('x') } },  // call as a command (stack)
    { type: 'ir_exprstmt', inputs: { VALUE: name('value') } },
  ] },
  { name: 'Built-ins', colour: '#6a8a5b', blocks: [
    builtin('print', [text('Hello')], true),               // print(...) — a command (stack) block
    builtin('input', [text('? ')]),
    builtin('len', [name('items')]),
    builtin('range', [konst(10)]),
    builtin('int', [name('x')]),
    builtin('str', [name('x')]),
    builtin('float', [name('x')]),
    builtin('bool', [name('x')]),
    builtin('abs', [name('x')]),
    builtin('round', [name('x')]),
    builtin('min', [name('items')]),
    builtin('max', [name('items')]),
    builtin('sum', [name('items')]),
    builtin('sorted', [name('items')]),
    builtin('list', [name('x')]),
    builtin('dict', []),
    builtin('set', [name('x')]),
    builtin('tuple', [name('x')]),
    builtin('type', [name('x')]),
    builtin('enumerate', [name('items')]),
    builtin('zip', [name('a'), name('b')]),
    // ── coverage fill (audit): common builtins that were missing ──
    builtin('any', [name('items')]),
    builtin('all', [name('items')]),
    builtin('map', [name('func'), name('items')]),
    builtin('filter', [name('func'), name('items')]),
    builtin('reversed', [name('items')]),
    builtin('isinstance', [name('x'), name('int')]),
    builtin('issubclass', [name('cls'), name('int')]),
    builtin('open', [text('file.txt'), text('r')]),
    builtin('pow', [name('x'), name('y')]),
    builtin('divmod', [name('a'), name('b')]),
    builtin('ord', [text('A')]),
    builtin('chr', [konst(65)]),
    builtin('repr', [name('x')]),
    builtin('format', [name('x'), text('.2f')]),
    builtin('hex', [name('x')]),
    builtin('oct', [name('x')]),
    builtin('bin', [name('x')]),
    builtin('bytes', [name('x')]),
    builtin('bytearray', [name('x')]),
    builtin('frozenset', [name('items')]),
    builtin('complex', [name('re'), name('im')]),
    builtin('iter', [name('items')]),
    builtin('next', [name('it')]),
    builtin('getattr', [name('obj'), text('attr')]),
    builtin('setattr', [name('obj'), text('attr'), name('value')], true),
    builtin('hasattr', [name('obj'), text('attr')]),
    builtin('delattr', [name('obj'), text('attr')], true),
    builtin('callable', [name('x')]),
    builtin('id', [name('x')]),
    builtin('hash', [name('x')]),
    builtin('slice', [konst(0), konst(10)]),
    builtin('super', []),
  ] },
  { name: 'Classes', colour: '#9a6a8a', blocks: [
    { type: 'ir_classdef' },                               // class C: pass
  ] },
  { name: 'Exceptions', colour: '#a0734a', blocks: [
    { type: 'ir_try' },                                    // try: pass / except: pass
    { type: 'ir_trystar', extraState: { handlers: [{ type: true, name: null }] },
      inputs: { TYPE0: name('Exception') } },
    { type: 'ir_raise' },                                  // bare re-raise
    { type: 'ir_assert', inputs: { TEST: konst(true) } },
    { type: 'ir_with', extraState: { items: [{ as: false }] }, inputs: { CTX0: name('ctx') } },
  ] },
  { name: 'Imports', colour: '#888888', blocks: [
    { type: 'ir_import' },                                 // import os
    { type: 'ir_importfrom' },                             // from os import path
  ] },
  { name: 'Sugar', colour: '#5b80a5', blocks: [
    { type: 'ir_listcomp', extraState: COMP_GENS, inputs: { ELT: name('x'), TARGET0: name('x'), ITER0: name('items') } },
    { type: 'ir_setcomp', extraState: COMP_GENS, inputs: { ELT: name('x'), TARGET0: name('x'), ITER0: name('items') } },
    { type: 'ir_genexp', extraState: COMP_GENS, inputs: { ELT: name('x'), TARGET0: name('x'), ITER0: name('items') } },
    { type: 'ir_dictcomp', extraState: COMP_GENS, inputs: { KEY: name('k'), VAL: name('v'), TARGET0: name('k'), ITER0: name('items') } },
    { type: 'ir_ifexp', inputs: { BODY: konst(0), TEST: konst(true), ORELSE: konst(0) } },
  ] },
  { name: 'Async', colour: '#5b80a5', blocks: [
    { type: 'ir_asyncfuncdef' },                           // async def f(): pass
    { type: 'ir_asyncfor', inputs: { TARGET: name('i'), ITER: name('items') } },
    { type: 'ir_asyncwith', extraState: { items: [{ as: false }] }, inputs: { CTX0: name('ctx') } },
    { type: 'ir_await', inputs: { VALUE: name('x') } },
    { type: 'ir_yield' },                                  // bare `yield`
    { type: 'ir_yieldfrom', inputs: { VALUE: name('x') } },
  ] },
  { name: 'Text', colour: '#a55b80', blocks: [
    { type: 'ir_joinedstr', extraState: { n: 0 } },        // f''
  ] },
  { name: 'Match', colour: '#a0734a', blocks: [
    // match x: / case _: pass   (MatchAs wildcard — no embedded exprs, no guard)
    { type: 'ir_match', extraState: { cases: [{ pattern: { p: 'As' }, nexpr: 0, guard: false }] },
      inputs: { SUBJECT: name('x') } },
  ] },
  { name: 'Types', colour: '#9a6a8a', blocks: [
    { type: 'ir_typealias', inputs: { VALUE: name('int') } },  // type X = int
  ] },
];

// Phase 5: a dynamic "Library" category compiled from the live registry (BlockPyLibRegistry).
// Each Tier-A block gets an ir_name shadow per arg so a freshly-dragged block is valid Python
// immediately (e.g. cv2.imread(filename)). Returns null when no library blocks are registered.
function libBlockEntry(b) {
  const inputs = {};
  (b.argNames || []).forEach((argName, i) => { inputs['ARG' + i] = name(argName); });
  const entry = { kind: 'block', type: b.type };
  if (Object.keys(inputs).length) entry.inputs = inputs;
  return entry;
}

// One toolbox category PER LIBRARY (named by the library, e.g. cv2 / pathlib / PIL.Image), instead
// of one lumped "Library". A library's blocks are bucketed by its source-library tag (lib, else the
// block's module for built-ins); a curated library nests one sub-category per semantic group
// (+ Other + Macros), an un-curated one is flat.
// A toolbox block entry from a registered type (curated tabs reference existing types; look up the
// spec for its argNames so the dragged-out block carries valid default shadows). null if unknown.
function typeBlockEntry(reg, type) {
  const spec = reg.getLibSpec ? reg.getLibSpec(type) : null;
  if (!spec) return null;
  return libBlockEntry({ type, argNames: spec.argNames || [] });
}

function libraryCategories() {
  const reg = (typeof window !== 'undefined' ? window : global).BlockPyLibRegistry;
  if (!reg || typeof reg.listLibBlocks !== 'function') return [];
  const groups = reg.listLibBlocks();
  const macros = (typeof reg.listMacros === 'function' ? reg.listMacros() : []) || [];

  const byLib = new Map();            // libKey -> { groups: Map<groupName,[entries]>, anyGroup }
  (groups || []).forEach((mod) => {
    mod.blocks.forEach((b) => {
      const libKey = b.lib || mod.module || 'Library';
      if (!byLib.has(libKey)) byLib.set(libKey, { groups: new Map(), anyGroup: false });
      const L = byLib.get(libKey);
      const g = b.group || '';
      if (g) L.anyGroup = true;
      if (!L.groups.has(g)) L.groups.set(g, []);
      L.groups.get(g).push(libBlockEntry(b));
    });
  });

  const macrosByLib = new Map();      // srcModule -> [macro block entries]
  macros.forEach((m) => {
    const k = m.srcModule || 'Library';
    if (!macrosByLib.has(k)) macrosByLib.set(k, []);
    macrosByLib.get(k).push({ kind: 'block', ...m.block });
  });

  const cats = [];
  for (const [libKey, L] of byLib) {
    const macroEntries = macrosByLib.get(libKey) || [];
    let contents;
    if (!L.anyGroup && !macroEntries.length) {
      contents = [...L.groups.values()].flat();                         // flat library
    } else {
      contents = [];
      for (const [g, entries] of L.groups) if (g) contents.push({ kind: 'category', name: g, colour: '#00897b', contents: entries });
      if (L.groups.has('') && L.groups.get('').length) contents.push({ kind: 'category', name: 'Other', colour: '#009688', contents: L.groups.get('') });
      if (macroEntries.length) contents.push({ kind: 'category', name: 'Macros', colour: '#7e57c2', contents: macroEntries });
    }
    cats.push({ kind: 'category', name: libKey, colour: '#009688', contents });
  }
  // libraries whose curation produced only macros (no plain blocks)
  for (const [libKey, entries] of macrosByLib) {
    if (!byLib.has(libKey)) cats.push({ kind: 'category', name: libKey, colour: '#009688', contents: [{ kind: 'category', name: 'Macros', colour: '#7e57c2', contents: entries }] });
  }

  // Curated tabs (Phase C3): one extra category per curation, a purpose-driven subset that references
  // the full library's already-registered block types. Grouped into sub-categories when the curation
  // carries semantic groups; a ★ name marks it as the curated view, distinct from the full library.
  const curations = (typeof reg.listCurations === 'function' ? reg.listCurations() : []) || [];
  for (const cur of curations) {
    const byGroup = new Map();
    (cur.items || []).forEach((it) => {
      const entry = typeBlockEntry(reg, it.type);
      if (!entry) return;                                  // type was removed -> skip stale ref
      const g = it.group || '';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(entry);
    });
    const macroEntries = (cur.macros || []).map((m) => ({ kind: 'block', ...m.block }));
    const anyGroup = [...byGroup.keys()].some((g) => g);
    let contents;
    if (!anyGroup && !macroEntries.length) {
      contents = [...byGroup.values()].flat();
    } else {
      contents = [];
      for (const [g, entries] of byGroup) if (g) contents.push({ kind: 'category', name: g, colour: '#00897b', contents: entries });
      if (byGroup.has('') && byGroup.get('').length) contents.push({ kind: 'category', name: 'Other', colour: '#009688', contents: byGroup.get('') });
      if (macroEntries.length) contents.push({ kind: 'category', name: 'Macros', colour: '#7e57c2', contents: macroEntries });
    }
    if (contents.length) cats.push({ kind: 'category', name: `★ ${cur.label || cur.key}`, colour: '#00796b', contents });
  }
  return cats;
}

// Compile the table to a Blockly categoryToolbox JSON object (+ a dynamic Library category).
function buildIrToolbox() {
  const contents = IR_TOOLBOX_TABLE.map((cat) => {
    const blocks = cat.blocks.map((b) => {
      const block = { kind: 'block', type: b.type };
      if (b.extraState) block.extraState = b.extraState;
      if (b.fields) block.fields = b.fields;
      if (b.inputs) block.inputs = b.inputs;
      return block;
    });
    // A category may prepend a flyout button (Variables' "Create variable…"); the button's
    // callbackkey is wired to Blockly.Variables.createVariableButtonHandler in BlocklyEditor.
    const items = cat.button
      ? [{ kind: 'button', text: cat.button.text, callbackkey: cat.button.callbackkey }, ...blocks]
      : blocks;
    return { kind: 'category', name: cat.name, colour: cat.colour, contents: items };
  });
  for (const cat of libraryCategories()) contents.push(cat);   // one category per registered library
  return { kind: 'categoryToolbox', contents };
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIrToolbox = buildIrToolbox();        // initial (registry empty at module-load time)
api.BlockPyBuildIrToolbox = buildIrToolbox;     // Phase 5: re-callable to refresh the Library category
if (typeof module !== 'undefined') module.exports = { buildIrToolbox, IR_TOOLBOX_TABLE };
