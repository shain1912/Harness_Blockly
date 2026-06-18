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
const STORAGE_KEY = 'blockpy.libRegistry.v1';
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function blockType(spec) {
  return `lib_${spec.module || ''}_${spec.func}${spec.hasOutput ? '' : '_stmt'}`;
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
  };
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
    byModule.get(mod).push({ type, title: spec.title, argNames: spec.argNames, hasOutput: spec.hasOutput });
  }
  return [...byModule.entries()].map(([module, blocks]) => ({ module, blocks }));
}

function removeLibrary(module) {
  for (const [type, spec] of [...SPECS]) if ((spec.module || '') === module) SPECS.delete(type);
  persist();
}

function clearAll() { SPECS.clear(); }

function persist() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return;
    ls.setItem(STORAGE_KEY, JSON.stringify([...SPECS.values()]));
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
    return out;
  } catch (_) { clearAll(); return []; }
}

// Async half of the oracle: confirm the spec lowers to a call that re-parses to a single
// Expr(Call) with matching func + arity. pythonToIR(pyodide, code) -> IR Module.
async function validateSpecParse(spec, pythonToIR, pyodide) {
  try {
    const argList = (spec.argNames || []).join(', ');
    const callExpr = spec.module ? `${spec.module}.${spec.func}(${argList})` : `${spec.func}(${argList})`;
    const ir = await pythonToIR(pyodide, callExpr);
    if (!ir || ir.type !== 'Module' || !Array.isArray(ir.body) || ir.body.length !== 1) return false;
    const st = ir.body[0];
    if (st.type !== 'Expr' || !st.value || st.value.type !== 'Call') return false;
    const call = st.value;
    if ((call.args || []).length !== (spec.argNames || []).length) return false;
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
  persist, hydrate, validateSpecParse, blockType, staticCheck,
};
if (typeof module !== 'undefined') module.exports = api.BlockPyLibRegistry;
