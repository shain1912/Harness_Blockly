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

// A comprehension generator/element default: [elt] for x in items
const COMP_GENS = { gens: [{ ifs: 0, async: false }] };

// The closed family table. Order = worklist order (common -> rare). Each block entry is
// { type, extraState?, fields?, inputs? }; extraState/inputs describe the default drag-out form.
const IR_TOOLBOX_TABLE = [
  { name: 'Values', colour: '#5b80a5', blocks: [
    { type: 'ir_name' },
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
    { type: 'ir_call', extraState: { nargs: 0, kw: [] }, inputs: { FUNC: name('func') } },
    { type: 'ir_exprstmt', inputs: { VALUE: name('value') } },
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
function libraryCategory() {
  const reg = (typeof window !== 'undefined' ? window : global).BlockPyLibRegistry;
  if (!reg || typeof reg.listLibBlocks !== 'function') return null;
  const groups = reg.listLibBlocks();
  if (!groups || !groups.length) return null;
  const blocks = [];
  groups.forEach((g) => {
    g.blocks.forEach((b) => {
      const inputs = {};
      (b.argNames || []).forEach((argName, i) => { inputs['ARG' + i] = name(argName); });
      const entry = { kind: 'block', type: b.type };
      if (Object.keys(inputs).length) entry.inputs = inputs;
      blocks.push(entry);
    });
  });
  return { kind: 'category', name: 'Library', colour: '#009688', contents: blocks };
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
  const lib = libraryCategory();
  if (lib) contents.push(lib);
  return { kind: 'categoryToolbox', contents };
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIrToolbox = buildIrToolbox();        // initial (registry empty at module-load time)
api.BlockPyBuildIrToolbox = buildIrToolbox;     // Phase 5: re-callable to refresh the Library category
if (typeof module !== 'undefined') module.exports = { buildIrToolbox, IR_TOOLBOX_TABLE };
