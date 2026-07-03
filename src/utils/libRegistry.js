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
// A curation is a VIEW (not new blocks): a named, purpose-driven SUBSET of already-registered block
// types, rendered as its own extra toolbox tab. We can't register duplicate specs for it because a
// block type (lib_<module>_<func>[_stmt]) is unique in SPECS — so the curated tab references the
// full library's existing types. key -> { key, label, lib, items:[{type,label,group}], macros:[…] }.
const CURATIONS = new Map();
// A module CONSTANT is a VALUE, not a call: keyed by its dotted reference (cv2.IMREAD_COLOR). It
// renders as a pre-filled ir_attribute{dotted} reporter that lowers to exactly that dotted name, so
// it round-trips losslessly with no new block type. dotted -> {dotted,name,module,lib,colour,...}.
const CONSTS = new Map();
// A class PROPERTY is a VALUE attribute (obj.device). Keyed uniquely by lib::Owner.attr. findAttr is
// NAME-BASED (colours the first property matching the attr name), consistent with method colouring —
// colour is derived only, never persisted or part of lowering, so a cross-class name clash is cosmetic.
const PROPS = new Map();
const STORAGE_KEY = 'blockpy.libRegistry.v1';
const MACRO_STORAGE_KEY = 'blockpy.libRegistry.macros.v1';
const CURATION_STORAGE_KEY = 'blockpy.libRegistry.curations.v1';
const CONST_STORAGE_KEY = 'blockpy.libRegistry.consts.v1';
const PROP_STORAGE_KEY = 'blockpy.libRegistry.props.v1';
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CONST_DOTTED = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/;

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
// A DOTTED module (urllib.parse, np.linalg) is legal: the program references the submodule through
// its import chain, the toolbox renders it as the SAME dotted ir_call the converter emits (exact
// lowering via the funcName attribute-chain rebuild), and no lib_* canvas block is ever defined for
// it (registerLibBlock skips defineBlock), so nothing can lower it as a single Name.
function staticCheck(spec) {
  if (!spec || typeof spec.func !== 'string' || !IDENT.test(spec.func)) return 'func is not a valid Python identifier';
  if (spec.module && !String(spec.module).split('.').every((seg) => IDENT.test(seg))) return 'module is not a valid (dotted) Python identifier';
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
    lib: spec.lib || '',              // source library -> its own toolbox category (one tab per library)
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
  // A dotted-module spec gets NO lib_* Blockly type: the toolbox offers it as the unified ir_call
  // (identical to the converted canvas block), which is also what keeps its lowering exact — a
  // lib_* block would need module to be a single Name.
  if (String(stored.module).indexOf('.') < 0) defineBlock(type, stored);
  return { ok: true, type };
}

function getLibSpec(type) { return SPECS.get(type); }

// Display lookup for the unified ir_call: is `<recv>.<attr>` a KNOWN library call, and what are its
// parameter names? Used by ir_call.updateShape_ to render known calls emerald with per-slot param
// labels (x, y, z…). Name-based (ignores arity/keywords) so a call with optional/keyword args still
// styles. module-function (module===recv, e.g. cv2.imread/math.sqrt) → isModule:true + its params;
// instance method (any receiver, e.g. device.move_to) → isModule:false + params after the receiver.
function findLibCall(recv, attr) {
  if (!attr) return null;
  let moduleHit = null;     // exact module match (cv2.imread when recv known) — most precise
  let methodHit = null;     // instance method by name (device.move_to) — receiver-agnostic
  let moduleByFunc = null;  // module-function by func name only — styles even when recv isn't known
  for (const [, spec] of SPECS) {
    if (spec.func !== attr) continue;
    if (!spec.method) {
      if (recv && spec.module === recv) { if (!moduleHit) moduleHit = spec; }
      else if (!moduleByFunc) moduleByFunc = spec;
    } else if (!methodHit) {
      methodHit = spec;
    }
  }
  const m = moduleHit || methodHit || moduleByFunc;
  if (!m) return null;
  // method spec's argNames[0] is the receiver — its positional params start at index 1.
  return { isModule: !m.method, params: (m.argNames || []).slice(m.method ? 1 : 0), colour: m.colour || '#009688' };
}

// ── Module constants (Feature 2): value reporters, not call blocks ────────────────
// Register a constant by its dotted reference. Idempotent (re-blockify: last wins). Rejected if the
// dotted path isn't a valid attribute chain (so the ir_attribute{dotted} block always lowers cleanly).
function registerConst(c) {
  if (!c || typeof c.dotted !== 'string' || !CONST_DOTTED.test(c.dotted)) return { ok: false, reason: 'const needs a dotted attribute path' };
  const dot = c.dotted.lastIndexOf('.');
  const stored = {
    dotted: c.dotted,
    name: c.name || c.dotted.slice(dot + 1),
    module: c.module || c.dotted.slice(0, dot),
    lib: c.lib || '',
    colour: c.colour || '#009688',
    valueType: c.valueType || '',
    valueRepr: c.valueRepr || '',
    prefix: c.prefix || '',
  };
  CONSTS.set(stored.dotted, stored);
  return { ok: true, dotted: stored.dotted };
}
function findConst(dotted) { return (dotted && CONSTS.get(dotted)) || null; }
function listConsts() { return [...CONSTS.values()]; }

// ── Class properties (Feature 1): value attributes (obj.device), not calls ────────
function _propKey(p) { return `${p.lib || p.module || 'Library'}::${p.owner || ''}.${p.attr}`; }
function registerProp(p) {
  if (!p || typeof p.attr !== 'string' || !IDENT.test(p.attr)) return { ok: false, reason: 'prop needs a valid attr name' };
  const stored = {
    attr: p.attr,
    owner: p.owner || '',
    recv: p.recv || String(p.owner || 'obj').toLowerCase(),
    module: p.module || '',
    lib: p.lib || '',
    colour: p.colour || '#009688',
  };
  PROPS.set(_propKey(stored), stored);
  return { ok: true };
}
// Lookup for ir_attribute colouring. ownerType (Tier-1 type inference) makes it PRECISE:
//   - a class name  -> match only a property of THAT class (no cross-class name clash);
//   - '__user__'    -> the receiver is an instance of a user-defined class -> never a library value;
//   - undefined/null-> receiver type unknown (loop var, param) -> name-based first match (fallback).
function findAttr(attr, ownerType) {
  if (!attr) return null;
  if (ownerType === '__user__') return null;
  for (const p of PROPS.values()) {
    if (p.attr !== attr) continue;
    if (ownerType) { if (p.owner === ownerType) return { colour: p.colour || '#009688', owner: p.owner }; }
    else return { colour: p.colour || '#009688', owner: p.owner };
  }
  return null;
}
function listProps() { return [...PROPS.values()]; }

// Recognize a BARE call `f(...)` that a `from mod import f` bound to a library function/class — matched
// against specs registered with an empty module (the bare form). Enables colouring `sqrt(x)` after
// `from math import sqrt` without a module prefix, losslessly.
function findBareFunc(name) {
  if (!name) return null;
  for (const [, spec] of SPECS) {
    if (spec.module === '' && spec.func === name && !spec.method) return { params: (spec.argNames || []).slice(), colour: spec.colour || '#009688' };
  }
  return null;
}

function listLibBlocks() {
  const byModule = new Map();
  for (const [type, spec] of SPECS) {
    const mod = spec.module || '';
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push({ type, title: spec.title, argNames: spec.argNames, hasOutput: spec.hasOutput, group: spec.group || '', lib: spec.lib || '' });
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
  for (const [d, c] of [...CONSTS]) if (set.has(c.module || '')) CONSTS.delete(d);   // drop this library's constants too (re-blockify replaces them)
  for (const [k, p] of [...PROPS]) if (set.has(p.module || '')) PROPS.delete(k);     // and its properties
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

// ── Curations (Phase C3): a purpose-driven, separate toolbox tab that's a VIEW over the full
// library's already-registered block types — so `pip install`/Blockify keeps showing every block,
// and Curate adds a small extra tab without duplicating (or wiping) anything. ────────────────────
function addCuration(c) {
  if (!c || typeof c.key !== 'string' || !Array.isArray(c.items)) return { ok: false, reason: 'curation needs {key, items[]}' };
  const items = c.items.filter((it) => it && typeof it.type === 'string')
    .map((it) => ({ type: it.type, label: it.label || '', group: it.group || '' }));
  const macros = (Array.isArray(c.macros) ? c.macros : [])
    .filter((m) => m && m.block).map((m) => ({ label: m.label || m.name || '', group: m.group || '', block: m.block }));
  if (!items.length && !macros.length) return { ok: false, reason: 'curation is empty' };
  CURATIONS.set(c.key, { key: c.key, label: c.label || c.key, lib: c.lib || '', items, macros });
  persistCurations();
  return { ok: true, key: c.key };
}
function listCurations() { return [...CURATIONS.values()]; }
function removeCuration(key) { const had = CURATIONS.delete(key); persistCurations(); return had; }
function removeCurationsByLib(lib) {
  for (const [k, c] of [...CURATIONS]) if ((c.lib || '') === lib) CURATIONS.delete(k);
  persistCurations();
}

function clearAll() { SPECS.clear(); MACROS.clear(); CURATIONS.clear(); CONSTS.clear(); PROPS.clear(); }

// ── Library (toolbox-tab) management ────────────────────────────────────────────
// A toolbox tab is keyed by `lib` (the source library, e.g. 'PIL.Image') falling back to the
// block's single-id `module`. listLibraries() returns one row per tab for the Library manager
// UI; a tab is `builtin` (not user-deletable) when ALL its blocks are built-in presets.
function _libKey(spec) { return spec.lib || spec.module || 'Library'; }

function listLibraries() {
  const byLib = new Map();
  for (const [, spec] of SPECS) {
    const key = _libKey(spec);
    if (!byLib.has(key)) byLib.set(key, { lib: key, blockCount: 0, userCount: 0, macroCount: 0 });
    const e = byLib.get(key);
    e.blockCount++;
    if (!spec.builtin) e.userCount++;
  }
  for (const m of MACROS.values()) {
    const key = m.srcModule || 'Library';
    if (!byLib.has(key)) byLib.set(key, { lib: key, blockCount: 0, userCount: 0, macroCount: 0 });
    byLib.get(key).macroCount++;
  }
  for (const c of CONSTS.values()) {                 // a lib with ONLY constants still gets a tab row
    const key = _libKey(c);
    if (!byLib.has(key)) byLib.set(key, { lib: key, blockCount: 0, userCount: 0, macroCount: 0 });
    const e = byLib.get(key);
    e.blockCount++;
    e.userCount++;
  }
  for (const p of PROPS.values()) {                  // properties count toward the tab too
    const key = _libKey(p);
    if (!byLib.has(key)) byLib.set(key, { lib: key, blockCount: 0, userCount: 0, macroCount: 0 });
    const e = byLib.get(key);
    e.blockCount++;
    e.userCount++;
  }
  const rows = [...byLib.values()]
    .map((e) => ({ ...e, builtin: e.userCount === 0 && e.macroCount === 0, curation: false }));
  // Curated tabs are views — list them as their own deletable rows (never built-in).
  for (const c of CURATIONS.values()) {
    rows.push({ lib: c.key, blockCount: c.items.length, userCount: c.items.length, macroCount: c.macros.length, builtin: false, curation: true });
  }
  return rows.sort((a, b) => a.lib.toLowerCase().localeCompare(b.lib.toLowerCase()));
}

// Remove every USER block + macro belonging to one toolbox tab (built-ins are preserved).
// Deletes the Blockly.Blocks defs too so the tab disappears from the toolbox. Returns removed types.
function removeLibraryByTab(libKey) {
  // A curated tab is a view: deleting it just drops the curation, leaving the full library intact.
  if (CURATIONS.has(libKey)) { removeCuration(libKey); return []; }
  const B = (typeof window !== 'undefined' ? window : global).Blockly;
  const removed = [];
  for (const [type, spec] of [...SPECS]) {
    if (_libKey(spec) !== libKey || spec.builtin) continue;
    SPECS.delete(type);
    removed.push(type);
    if (B && B.Blocks && B.Blocks[type]) { try { delete B.Blocks[type]; } catch (_) { /* keep going */ } }
  }
  for (const [name, m] of [...MACROS]) if ((m.srcModule || 'Library') === libKey) MACROS.delete(name);
  for (const [d, c] of [...CONSTS]) if (_libKey(c) === libKey) CONSTS.delete(d);   // drop this tab's constants
  for (const [k, p] of [...PROPS]) if (_libKey(p) === libKey) PROPS.delete(k);     // and its properties
  removeCurationsByLib(libKey);   // removing the source library removes its curated tabs too
  persist();
  return removed;
}

// Wipe ALL user-added libraries + macros at once (built-in presets stay). Returns removed types.
function removeAllUserLibraries() {
  const B = (typeof window !== 'undefined' ? window : global).Blockly;
  const removed = [];
  for (const [type, spec] of [...SPECS]) {
    if (spec.builtin) continue;
    SPECS.delete(type);
    removed.push(type);
    if (B && B.Blocks && B.Blocks[type]) { try { delete B.Blocks[type]; } catch (_) { /* keep going */ } }
  }
  MACROS.clear();
  CURATIONS.clear();
  CONSTS.clear();   // no built-in constants — all are user-added
  PROPS.clear();
  persist();
  return removed;
}

function persist() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return;
    ls.setItem(STORAGE_KEY, JSON.stringify([...SPECS.values()].filter((s) => !s.builtin)));   // built-ins are re-registered in-memory each mount, never persisted
  } catch (_) { /* non-fatal */ }
  persistMacros();
  persistCurations();
  persistConsts();
  persistProps();
}

function persistConsts() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return;
    ls.setItem(CONST_STORAGE_KEY, JSON.stringify([...CONSTS.values()]));
  } catch (_) { /* non-fatal */ }
}

function persistProps() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return;
    ls.setItem(PROP_STORAGE_KEY, JSON.stringify([...PROPS.values()]));
  } catch (_) { /* non-fatal */ }
}

function persistCurations() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return;
    ls.setItem(CURATION_STORAGE_KEY, JSON.stringify([...CURATIONS.values()]));
  } catch (_) { /* non-fatal */ }
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
    hydrateCurations();
    hydrateConsts();
    hydrateProps();
    return out;
  } catch (_) { clearAll(); return []; }
}

function hydrateConsts() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return [];
    const raw = ls.getItem(CONST_STORAGE_KEY);
    const consts = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(consts)) return [];
    for (const c of consts) registerConst(c);
    return listConsts();
  } catch (_) { return []; }
}

function hydrateProps() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return [];
    const raw = ls.getItem(PROP_STORAGE_KEY);
    const props = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(props)) return [];
    for (const p of props) registerProp(p);
    return listProps();
  } catch (_) { return []; }
}

function hydrateCurations() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return [];
    const raw = ls.getItem(CURATION_STORAGE_KEY);
    const curations = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(curations)) return [];
    for (const c of curations) addCuration(c);
    return listCurations();
  } catch (_) { return []; }
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
  registerLibBlock, getLibSpec, findLibCall, listLibBlocks, removeLibrary, clearAll,
  persist, hydrate, validateSpecParse, blockType, staticCheck, specFromDescriptor,
  removeModules, addMacro, listMacros, removeMacro, removeMacrosBySource, persistMacros, hydrateMacros,
  listLibraries, removeLibraryByTab, removeAllUserLibraries,
  addCuration, listCurations, removeCuration, removeCurationsByLib, persistCurations, hydrateCurations,
  registerConst, findConst, listConsts, persistConsts, hydrateConsts,
  registerProp, findAttr, listProps, persistProps, hydrateProps,
  findBareFunc,
};
if (typeof module !== 'undefined') module.exports = api.BlockPyLibRegistry;
