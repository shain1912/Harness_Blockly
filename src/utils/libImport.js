/* libImport.js — bridge: blockpy-gen LibrarySpec → app libRegistry specs (Phase B integration).
 *
 * blockpy-gen introspects a Python module into a LibrarySpec: a dotted `module` plus `entries`
 * of kind function | class | method, each with typed `params` ({name, kind, hasDefault}) and a
 * boolean `returns`. The app's libRegistry (Tier-A) speaks a flatter dialect: a SINGLE-segment
 * `module`, a `func`, plain `argNames`, `hasOutput`, and a display `title` — and it lowers each
 * block to the EXACT Call IR the title shows (so Python<->blocks round-trips losslessly).
 *
 * Two translations bridge the gap:
 *   1. Dotted module → leaf ALIAS. libRegistry.module must be one identifier, so `PIL.Image`
 *      collapses to `Image` (the `from PIL import Image` form) and we surface that import string.
 *      A single-segment module ('requests') stays itself with a plain `import requests`.
 *   2. Methods → receiver model. A method `Image.resize` becomes `image.resize` where the
 *      receiver var (owner lowercased) is BOTH the title prefix and argNames[0] — the shape
 *      libRegistry.isMethodSpec detects to lower to `<recv>.resize(args[1:])`.
 *
 * Required params only (hasDefault === false, positional/keyword) become argNames — Tier-A blocks
 * are fixed-arity, so we expose the essential signature; vararg/kwarg can't be represented and are
 * dropped. The LLM curation pass (Phase C) refines which optionals to surface per purpose.
 *
 * Pure (no Node/Blockly/python deps) so it runs in the browser after the backend returns a spec,
 * and is unit-testable in node. Attaches window.BlockPyLibImport; also module.exports for tests.
 */

const IMP_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

// positional/keyword params without a default = the essential, representable signature.
function requiredParamNames(entry) {
  return (entry.params || [])
    .filter((p) => (p.kind === 'positional' || p.kind === 'keyword') && !p.hasDefault)
    .map((p) => p.name);
}

// Map one LibrarySpec entry to libRegistry spec(s). Returns an ARRAY (0..2), because Blockly blocks
// are EITHER a value (reporter, output plug) OR a command (statement, stack) — never both — yet a
// real-world call is often used both ways and most libraries carry no `-> None` annotation to tell
// us which. So:
//   • class constructor  -> [reporter]            (you assign the instance: `d = Dobot(port)`)
//   • returns:false (`-> None`) -> [command]      (pure side-effect, never a value)
//   • value OR unknown (the common un-annotated case) -> [reporter, command]
// Emitting both for the ambiguous case is why a robot library's `dobot.move_to(...)` finally has a
// GREEN command block to drag into the program flow, while `cv2.imread(...)` still has a reporter to
// plug into an assignment. The two get distinct types (`lib_x_f` vs `lib_x_f_stmt`) in libRegistry.
// Reporter is listed first so find-by-title resolves to the value form. [] if unrepresentable.
function entryToSpec(entry, alias, colour) {
  if (!entry || typeof entry.name !== 'string' || !IMP_IDENT.test(entry.name)) return [];
  const reqd = requiredParamNames(entry);

  let base;
  if (entry.kind === 'method') {
    if (typeof entry.owner !== 'string' || !IMP_IDENT.test(entry.owner)) return [];
    const recv = entry.owner.toLowerCase();
    if (!IMP_IDENT.test(recv)) return [];
    base = { module: recv, func: entry.name, argNames: [recv, ...reqd], colour, title: `${recv}.${entry.name}` };
  } else {
    // function or class: module-rooted call under the leaf alias
    base = { module: alias, func: entry.name, argNames: reqd, colour, title: `${alias}.${entry.name}` };
  }

  if (entry.kind === 'class') return [{ ...base, hasOutput: true }];
  if (entry.returns === false) return [{ ...base, hasOutput: false }];
  return [{ ...base, hasOutput: true }, { ...base, hasOutput: false }];
}

// The import a user must add for the leaf alias to resolve: dotted -> `from <parent> import <leaf>`,
// single-segment -> `import <module>`.
function importStatement(moduleDotted, alias) {
  const dot = moduleDotted.lastIndexOf('.');
  if (dot <= 0) return `import ${moduleDotted}`;
  return `from ${moduleDotted.slice(0, dot)} import ${alias}`;
}

// The REAL ir_* import block JSON for that statement, so the app can drop it into the workspace
// (lossless — it round-trips like any hand-built import) instead of the user adding it by hand.
// Dotted -> ir_importfrom { MODULE:<parent>, NAMES:<alias> }; single -> ir_import { NAMES:<module> }.
function importBlockJson(moduleDotted, alias) {
  const dot = moduleDotted.lastIndexOf('.');
  if (dot <= 0) return { type: 'ir_import', fields: { NAMES: moduleDotted } };
  return { type: 'ir_importfrom', fields: { MODULE: moduleDotted.slice(0, dot), NAMES: alias } };
}

// Every registry `module` value a library maps to: the alias (functions/classes) plus each method
// receiver (owner lowercased). A Blockify/Curate of the library removes exactly these before
// re-registering, so a re-run's labels/groups win instead of being shadowed by the first specs.
function libraryModules(librarySpec, opts = {}) {
  const moduleDotted = (librarySpec && librarySpec.module) || '';
  const leaf = moduleDotted.includes('.') ? moduleDotted.slice(moduleDotted.lastIndexOf('.') + 1) : moduleDotted;
  const alias = opts.alias || leaf;
  const mods = new Set();
  for (const e of (librarySpec && librarySpec.entries) || []) {
    if (e && e.kind === 'method') { if (e.owner) mods.add(String(e.owner).toLowerCase()); }
    else mods.add(alias);
  }
  return [...mods];
}

// LibrarySpec -> { alias, importStmt, specs:[libRegistry spec...] }. opts.alias overrides the leaf;
// opts.colour themes the blocks. Entries that can't be represented are silently skipped.
function librarySpecToRegistrySpecs(librarySpec, opts = {}) {
  const moduleDotted = (librarySpec && librarySpec.module) || '';
  const leaf = moduleDotted.includes('.') ? moduleDotted.slice(moduleDotted.lastIndexOf('.') + 1) : moduleDotted;
  const alias = opts.alias || leaf;
  const colour = opts.colour;
  const entries = (librarySpec && librarySpec.entries) || [];
  const specs = [];
  for (const e of entries) {
    for (const s of entryToSpec(e, alias, colour)) { s.lib = moduleDotted; specs.push(s); }   // tag source library -> its own toolbox category
  }
  return { alias, importStmt: importStatement(moduleDotted, alias), specs };
}

// The canonical reference for an entry: its qualName when introspection supplied one, else a
// computed dotted path (module.func / module.Class / module.Owner.method). LLM curation refers
// to entries by this string; an unknown ref is dropped (never invents a block).
function entryQualName(moduleDotted, entry) {
  if (entry.qualName) return entry.qualName;
  if (entry.kind === 'method') return `${moduleDotted}.${entry.owner}.${entry.name}`;
  return `${moduleDotted}.${entry.name}`;
}

// Phase C (curation): given an LLM's purpose-driven selection [{ref, label?, group?}], register
// ONLY those entries — with the introspected (correct) signature but the LLM's friendly DISPLAY
// label and semantic group. `label` overrides spec.title (display-only; module/func still drive
// lowering, so the call stays exact). Refs not found in the spec are returned in `dropped`.
function curationToRegistrySpecs(librarySpec, selected, opts = {}) {
  const moduleDotted = (librarySpec && librarySpec.module) || '';
  const leaf = moduleDotted.includes('.') ? moduleDotted.slice(moduleDotted.lastIndexOf('.') + 1) : moduleDotted;
  const alias = opts.alias || leaf;
  const index = new Map();
  for (const e of (librarySpec && librarySpec.entries) || []) index.set(entryQualName(moduleDotted, e), e);
  const specs = [];
  const dropped = [];
  for (const sel of selected || []) {
    const e = sel && index.get(sel.ref);
    const variants = e ? entryToSpec(e, alias, opts.colour) : [];
    if (!variants.length) { if (sel && sel.ref) dropped.push(sel.ref); continue; }
    for (const base of variants) {
      if (sel.label) base.title = String(sel.label);    // display-only; lowering uses module/func
      if (sel.group) base.group = String(sel.group);
      base.lib = moduleDotted;                            // source library -> its own toolbox category
      specs.push(base);
    }
  }
  return { alias, importStmt: importStatement(moduleDotted, alias), specs, dropped };
}

// Phase C2 (macros): a macro is a multi-step workflow the AI composed from REAL calls. We render
// it as a COMPOSITE block tree of ordinary ir_* blocks (assign/call/attribute/name/const) — no new
// block type, no special lowering, so the dropped primitives round-trip like any hand-built blocks.

// Split top-level comma args, respecting (), [] nesting and quotes (for "(64, 64)" etc.).
function splitTopArgs(s) {
  const out = [];
  let depth = 0; let cur = ''; let q = null;
  for (const ch of String(s)) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') { depth++; cur += ch; continue; }
    if (ch === ')' || ch === ']') { depth--; cur += ch; continue; }
    if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// A single argument string -> an IR expression. Handles identifiers, string/number/bool/None
// literals, and (..)/[..] of the same; anything unrecognized falls back to a Name (best-effort,
// still editable once dropped).
function argToIr(s) {
  const t = String(s).trim();
  if (/^-?\d+$/.test(t)) return { type: 'Constant', value: parseInt(t, 10) };
  if (/^-?\d*\.\d+$/.test(t)) return { type: 'Constant', value: parseFloat(t) };
  if (/^(['"]).*\1$/.test(t)) return { type: 'Constant', value: t.slice(1, -1) };
  if (t === 'True') return { type: 'Constant', value: true };
  if (t === 'False') return { type: 'Constant', value: false };
  if (t === 'None') return { type: 'Constant', value: null };
  if (/^\(.*\)$/.test(t)) return { type: 'Tuple', elts: splitTopArgs(t.slice(1, -1)).map(argToIr) };
  if (/^\[.*\]$/.test(t)) return { type: 'List', elts: splitTopArgs(t.slice(1, -1)).map(argToIr) };
  return { type: 'Name', id: t };
}

// One macro step -> an IR statement. A method step lowers to `<recv>.<m>(rest)` (receiver = first
// arg); a function/class step to `<alias>.<name>(args)`. With `assign`, wrap in Assign; else Expr.
function macroStepToStmt(index, alias, step) {
  const entry = index.get(step.ref);
  const fname = entry ? entry.name : String(step.ref).split('.').pop();
  const isMethod = !!(entry && entry.kind === 'method');
  const args = (step.args || []).map(argToIr);
  let call;
  if (isMethod) {
    const recv = args[0] || { type: 'Name', id: 'obj' };
    call = { type: 'Call', func: { type: 'Attribute', value: recv, attr: fname }, args: args.slice(1), keywords: [] };
  } else {
    call = { type: 'Call', func: { type: 'Attribute', value: { type: 'Name', id: alias }, attr: fname }, args, keywords: [] };
  }
  return step.assign
    ? { type: 'Assign', targets: [{ type: 'Name', id: String(step.assign) }], value: call }
    : { type: 'Expr', value: call };
}

// Macros -> [{name, label, group, block}] where block is the composed ir_* tree (head block with a
// next-chain). Uses the pure window.BlockPyIR.irToBlockly, so it needs no Pyodide and round-trips.
function macrosToRegistry(librarySpec, macros, opts = {}) {
  const moduleDotted = (librarySpec && librarySpec.module) || '';
  const leaf = moduleDotted.includes('.') ? moduleDotted.slice(moduleDotted.lastIndexOf('.') + 1) : moduleDotted;
  const alias = opts.alias || leaf;
  const index = new Map();
  for (const e of (librarySpec && librarySpec.entries) || []) index.set(entryQualName(moduleDotted, e), e);
  const IR = (typeof window !== 'undefined' ? window : global).BlockPyIR;
  const out = [];
  for (const m of macros || []) {
    if (!m || typeof m.name !== 'string' || !Array.isArray(m.steps) || !m.steps.length) continue;
    const body = m.steps.map((s) => macroStepToStmt(index, alias, s));
    let block;
    // irToBlockly returns { blocks: <workspace {languageVersion, blocks:[…]}>, variables }; the
    // composed head block (with its next-chain) is blocks.blocks[0].
    try { const ws = IR && IR.irToBlockly({ type: 'Module', body }); block = ws && ws.blocks && ws.blocks.blocks && ws.blocks.blocks[0]; } catch (_) { block = null; }
    if (!block) continue;
    out.push({ name: m.name, label: m.label || m.name, group: m.group || '', block, srcModule: moduleDotted });
  }
  return out;
}

const impApi = (typeof window !== 'undefined' ? window : global);
impApi.BlockPyLibImport = {
  librarySpecToRegistrySpecs, curationToRegistrySpecs, macrosToRegistry, libraryModules,
  entryQualName, requiredParamNames, importStatement, importBlockJson, argToIr, splitTopArgs,
};
if (typeof module !== 'undefined') module.exports = impApi.BlockPyLibImport;
