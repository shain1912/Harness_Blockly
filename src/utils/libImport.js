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

// Map one LibrarySpec entry to a libRegistry spec (or null if it can't be represented).
function entryToSpec(entry, alias, colour) {
  if (!entry || typeof entry.name !== 'string' || !IMP_IDENT.test(entry.name)) return null;
  const reqd = requiredParamNames(entry);
  const hasOutput = entry.returns !== false;       // returns:false (-> None) is the only statement case

  if (entry.kind === 'method') {
    if (typeof entry.owner !== 'string' || !IMP_IDENT.test(entry.owner)) return null;
    const recv = entry.owner.toLowerCase();
    if (!IMP_IDENT.test(recv)) return null;
    return {
      module: recv, func: entry.name, argNames: [recv, ...reqd],
      hasOutput, colour, title: `${recv}.${entry.name}`,
    };
  }
  // function or class: module-rooted call under the leaf alias
  return {
    module: alias, func: entry.name, argNames: reqd,
    hasOutput, colour, title: `${alias}.${entry.name}`,
  };
}

// The import a user must add for the leaf alias to resolve: dotted -> `from <parent> import <leaf>`,
// single-segment -> `import <module>`.
function importStatement(moduleDotted, alias) {
  const dot = moduleDotted.lastIndexOf('.');
  if (dot <= 0) return `import ${moduleDotted}`;
  return `from ${moduleDotted.slice(0, dot)} import ${alias}`;
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
    const s = entryToSpec(e, alias, colour);
    if (s) specs.push(s);
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
    const base = e ? entryToSpec(e, alias, opts.colour) : null;
    if (!base) { if (sel && sel.ref) dropped.push(sel.ref); continue; }
    if (sel.label) base.title = String(sel.label);    // display-only; lowering uses module/func
    if (sel.group) base.group = String(sel.group);
    specs.push(base);
  }
  return { alias, importStmt: importStatement(moduleDotted, alias), specs, dropped };
}

const impApi = (typeof window !== 'undefined' ? window : global);
impApi.BlockPyLibImport = { librarySpecToRegistrySpecs, curationToRegistrySpecs, entryQualName, requiredParamNames, importStatement };
if (typeof module !== 'undefined') module.exports = impApi.BlockPyLibImport;
