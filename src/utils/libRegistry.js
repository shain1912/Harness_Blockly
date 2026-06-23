/* libRegistry.js — Phase 5 dynamic/AI library block registry (Tier-A authoring blocks).
 *
 * Single source of truth for registered library CALL blocks. A Tier-A block is a "skin" over a
 * Call IR: it carries {module, func, argNames} and lowers (in blocklyToIr) to the exact same Call
 * IR as the Tier-B ir_call/ir_attribute path — so round-trip is lossless. Authoring-only:
 * Python->blocks always yields Tier-B; irToBlockly is untouched. Works in node (Blockly /
 * localStorage absent → visual-def and persistence are no-ops; Map + oracle still run) so the
 * registry can be unit-tested without a browser.
 */

const SPECS = new Map();                 // block type -> normalized spec
const MACROS = new Map();                 // macro name -> { name, label, group, block } (Phase C2)
const STORAGE_KEY = 'blockpy.libRegistry.v1';
const MACRO_STORAGE_KEY = 'blockpy.libRegistry.macros.v1';
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function blockType(spec) {
  return `lib_${spec.module || ''}_${spec.func}${spec.hasOutput ? '' : '_stmt'}`;
}

// An instance-method Tier-A block: the AI abstracts `recv.method(...)` as a descriptor whose title
// is 'recv.method' AND whose first arg name is the receiver itself (e.g. {title:'image.save',
// args:['image','filename']}). Detect that (receiver name === argNames[0]) so the block lowers to
// `<ARG0>.method(<ARG1..>)` instead of the wrong `recv.method(recv, ...)`. A module function
// (cv2.imread, args ['filename']) does NOT match and stays `module.func(args)`.
function isMethodSpec(spec) {
  const args = (spec && spec.argNames) || [];
  return !!(spec && spec.module && args.length >= 1 && spec.module === args[0]);
}

// Synchronous half of the round-trip oracle (no Pyodide). Returns an error string or null (ok).
function staticCheck(spec) {
  if (!spec || typeof spec.func !== 'string' || !IDENT.test(spec.func)) return 'func is not a valid Python identifier';
  if (spec.module && !IDENT.test(spec.module)) return 'module is not a valid Python identifier';
  const args = spec.argNames || [];
  if (!Array.isArray(args)) return 'argNames must be an array';
  const seen = new Set();
  for (const a of args) {
    if (typeof a !== 'string' || !IDENT.test(a)) return 'arg name is not a valid identifier: ' + a;
    if (seen.has(a)) return 'duplicate arg name: ' + a;
    seen.add(a);
  }
  return null;
}

// Define the visual Blockly block (NO legacy Blockly.Python generator — lowering goes via IR).
function defineBlock(type, spec) {
  const B = (typeof window !== 'undefined' ? window : global).Blockly;
  if (!B || !B.Blocks) return;           // node / pre-Blockly: skip visual def, keep the Map entry
  if (B.Blocks[type]) return;            // idempotent (Blockly throws on redefinition)
  const argNames = spec.argNames || [];
  const title = spec.title;
  const colour = spec.colour;
  const hasOutput = spec.hasOutput;
  const tip = `${spec.module ? spec.module + '.' : ''}${spec.func}()`;
  B.Blocks[type] = {
    init: function () {
      this.appendDummyInput().appendField(title);
      argNames.forEach((argName, idx) => {
        this.appendValueInput('ARG' + idx).setCheck(null).appendField(argName);
      });
      if (hasOutput) this.setOutput(true, null);
      else { this.setPreviousStatement(true, null); this.setNextStatement(true, null); }
      this.setColour(colour);
      this.setTooltip(tip);
    },
  };
}

// Build a registry spec from an AI/preset block descriptor {func, args, hasOutput, colour, title}.
// The visible title (e.g. 'plt.plot', 'df.describe', 'cv2.imread') is the promise, so module+func
// are always derived from it when the title carries a dot (exact-lowering invariant). A multi-dot
// receiver (e.g. 'matplotlib.pyplot.plot') yields a DOTTED module that staticCheck rejects —
// registerLibBlock returns {ok:false} and the pipeline demotes the block (Tier-B generic
// nested-attribute blocks handle those). Only fall back to libName when the title has NO dot.
function specFromDescriptor(b, libName) {
  const title = (b && typeof b.title === 'string') ? b.title.trim() : '';
  const dot = title.lastIndexOf('.');
  let module, func;
  if (dot > 0 && dot < title.length - 1) {
    // Title carries a receiver (e.g. 'cv2.imread', 'plt.plot', or multi-dot 'matplotlib.pyplot.plot').
    // Derive module+func straight from it so the block lowers to EXACTLY the call shown. A multi-dot
    // receiver yields a DOTTED module that staticCheck rejects -> registerLibBlock demotes it (Tier-B
    // generic nested-attribute blocks cover those). NEVER fall back to libName here, which would make
    // the lowered call differ from the displayed title (exact-lowering invariant).
    module = title.slice(0, dot);
    func = title.slice(dot + 1);
  } else {
    module = libName || '';
    func = b.func;
  }
  return {
    module,
    func,
    argNames: Array.isArray(b.args) ? b.args : [],
    hasOutput: !!b.hasOutput,
    colour: b.colour,
    title: title || (module ? module + '.' + func : func),
  };
}

function registerLibBlock(spec) {
  const reason = staticCheck(spec);
  if (reason) return { ok: false, reason };
  const stored = {
    module: spec.module || '',
    func: spec.func,
    argNames: (spec.argNames || []).slice(),
    hasOutput: !!spec.hasOutput,
    colour: spec.colour || '#009688',
    title: spec.title || `${spec.module ? spec.module + '.' : ''}${spec.func}`,
    group: spec.group || '',          // Phase C: semantic group (LLM curation) -> toolbox sub-category
    builtin: !!spec.builtin,
  };
  stored.method = isMethodSpec(stored);   // instance method -> lowering uses ARG0 as the receiver
  const type = blockType(stored);
  const existing = SPECS.get(type);
  if (existing) {
    // Same function (module+func) re-registered → idempotent no-op (first signature wins; keeps
    // SPECS in sync with the already-defined Blockly.Blocks[type]). Re-register to change a
    // signature requires removeLibrary first.
    if (existing.module === stored.module && existing.func === stored.func) return { ok: true, type };
    // Two DIFFERENT functions colliding on the same generated type (lib_${module}_${func} is not
    // injective, e.g. a_b.c vs a.b_c) → reject, so a Tier-A block never silently lowers to the
    // wrong call (exact-lowering invariant).
    return { ok: false, reason: 'block type collision: ' + type };
  }
  SPECS.set(type, stored);
  defineBlock(type, stored);
  return { ok: true, type };
}

function getLibSpec(type) { return SPECS.get(type); }

function listLibBlocks() {
  const byModule = new Map();
  for (const [type, spec] of SPECS) {
    const mod = spec.module || '';
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push({ type, title: spec.title, argNames: spec.argNames, hasOutput: spec.hasOutput, group: spec.group || '' });
  }
  return [...byModule.entries()].map(([module, blocks]) => ({ module, blocks }));
}

function removeLibrary(module) {
  for (const [type, spec] of [...SPECS]) if ((spec.module || '') === module) SPECS.delete(type);
  persist();
}

// Phase C fix: a Blockify/Curate of a library re-registers it from scratch, so its labels/groups
// reflect the latest run (not the first-spec, which registerLibBlock keeps idempotently). Remove
// every block in the given registry modules — AND delete its Blockly.Blocks def so defineBlock will
// redefine with the new title (a baked-in init() closure otherwise shows the stale label). Built-ins
// (cv2 presets) are preserved. Returns the removed block types.
function removeModules(modules) {
  const set = new Set(modules || []);
  const B = (typeof window !== 'undefined' ? window : global).Blockly;
  const removed = [];
  for (const [type, spec] of [...SPECS]) {
    if (!set.has(spec.module || '') || spec.builtin) continue;
    SPECS.delete(type);
    removed.push(type);
    if (B && B.Blocks && B.Blocks[type]) { try { delete B.Blocks[type]; } catch (_) { /* keep going */ } }
  }
  persist();
  return removed;
}

function removeMacrosBySource(src) {
  for (const [name, m] of [...MACROS]) if ((m.srcModule || '') === src) MACROS.delete(name);
  persistMacros();
}

// Phase C2: a macro is an authoring-only COMPOSITE — a precomputed Blockly block tree (chained
// statements) that drops a multi-step workflow as ordinary, editable ir_* blocks. It carries no
// new block type and no lowering: the dropped primitives round-trip like any hand-built blocks.
function addMacro(macro) {
  if (!macro || typeof macro.name !== 'string' || !macro.block) return { ok: false, reason: 'macro needs {name, block}' };
  MACROS.set(macro.name, {
    name: macro.name, label: macro.label || macro.name, group: macro.group || '', block: macro.block,
    srcModule: macro.srcModule || '',
  });
  return { ok: true, name: macro.name };
}
function listMacros() { return [...MACROS.values()]; }
function removeMacro(name) { MACROS.delete(name); persistMacros(); }

function clearAll() { SPECS.clear(); MACROS.clear(); }

function persist() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return;
    ls.setItem(STORAGE_KEY, JSON.stringify([...SPECS.values()].filter((s) => !s.builtin)));   // built-ins are re-registered in-memory each mount, never persisted
  } catch (_) { /* non-fatal */ }
  persistMacros();
}

function persistMacros() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return;
    ls.setItem(MACRO_STORAGE_KEY, JSON.stringify([...MACROS.values()]));
  } catch (_) { /* non-fatal */ }
}

// Re-register every persisted spec (restores Blockly.Blocks defs after reload). Returns the
// installedBlocks-shaped list the UI keeps in React state.
function hydrate() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return [];
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return [];
    const specs = JSON.parse(raw);
    if (!Array.isArray(specs)) return [];
    const out = [];
    for (const spec of specs) {
      const res = registerLibBlock(spec);
      if (res.ok) out.push({ type: res.type, title: spec.title, hasOutput: !!spec.hasOutput, func: spec.func, args: spec.argNames || [], colour: spec.colour });
    }
    hydrateMacros();
    return out;
  } catch (_) { clearAll(); return []; }
}

function hydrateMacros() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return [];
    const raw = ls.getItem(MACRO_STORAGE_KEY);
    const macros = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(macros)) return [];
    for (const m of macros) addMacro(m);
    return listMacros();
  } catch (_) { return []; }
}

// Async half of the oracle: confirm the spec lowers to a call that re-parses to a single
// Expr(Call) with matching func + arity. pythonToIR(pyodide, code) -> IR Module.
async function validateSpecParse(spec, pythonToIR, pyodide) {
  try {
    const args = spec.argNames || [];
    const method = isMethodSpec(spec);   // validate what lowering ACTUALLY produces
    // method -> `recv.func(args[1:])`; module fn -> `module.func(args)`; bare -> `func(args)`.
    const callExpr = method
      ? `${args[0]}.${spec.func}(${args.slice(1).join(', ')})`
      : (spec.module ? `${spec.module}.${spec.func}(${args.join(', ')})` : `${spec.func}(${args.join(', ')})`);
    const ir = await pythonToIR(pyodide, callExpr);
    if (!ir || ir.type !== 'Module' || !Array.isArray(ir.body) || ir.body.length !== 1) return false;
    const st = ir.body[0];
    if (st.type !== 'Expr' || !st.value || st.value.type !== 'Call') return false;
    const call = st.value;
    const expectedArity = method ? args.length - 1 : args.length;
    if ((call.args || []).length !== expectedArity) return false;
    if (method) {
      return !!(call.func && call.func.type === 'Attribute' && call.func.attr === spec.func
        && call.func.value && call.func.value.type === 'Name' && call.func.value.id === args[0]);
    }
    if (spec.module) {
      return !!(call.func && call.func.type === 'Attribute' && call.func.attr === spec.func
        && call.func.value && call.func.value.type === 'Name' && call.func.value.id === spec.module);
    }
    return !!(call.func && call.func.type === 'Name' && call.func.id === spec.func);
  } catch (_) { return false; }
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyLibRegistry = {
  registerLibBlock, getLibSpec, listLibBlocks, removeLibrary, clearAll,
  persist, hydrate, validateSpecParse, blockType, staticCheck, specFromDescriptor,
  removeModules, addMacro, listMacros, removeMacro, removeMacrosBySource, persistMacros, hydrateMacros,
};
if (typeof module !== 'undefined') module.exports = api.BlockPyLibRegistry;
