// Full-engine stress test: run the COMPLETE blockpy-gen pipeline over many real Python
// libraries — introspect -> validate -> defineBlocks (real init shape) -> buildToolbox ->
// execute EVERY generated code generator. Pure survey (not node:test); prints a report.
import { introspectModule } from '../src/introspect/introspect.js';
import { defineBlocks } from '../src/blocks/define.js';
import { buildToolbox } from '../src/blocks/toolbox.js';
import { validateSpec } from '../src/spec.js';

// A fake Blockly whose blocks actually run init() (recording the input shape) so we exercise
// the real defineBlocks init path, and whose Python generators we can invoke per block.
function makeBlockly() {
  return { Blocks: {}, Python: { forBlock: {}, ORDER_ATOMIC: 0, ORDER_NONE: 99 } };
}
function buildShape(B, type) {
  const inputs = [];
  let output = false, statement = false;
  const chain = { appendField: () => chain };
  const block = {
    appendDummyInput: () => chain,
    appendValueInput: (n) => { inputs.push(n); return chain; },
    setOutput: () => { output = true; },
    setPreviousStatement: () => { statement = true; },
    setNextStatement: () => {}, setColour: () => {}, setTooltip: () => {},
  };
  B.Blocks[type].init.call(block);
  return { inputs, output, statement };
}

// A generator instance that resolves every value input to a placeholder so codegen runs fully.
function fakeGen(shape) {
  const vals = {};
  for (const n of shape.inputs) vals[n] = (n === 'RECV') ? 'obj' : '1';
  return { ORDER_ATOMIC: 0, ORDER_NONE: 99, valueToCode: (_b, n) => vals[n] || '' };
}

const MODULES = [
  // stdlib spread
  'json', 'math', 'os', 'collections', 'datetime', 'random', 'textwrap', 're',
  'itertools', 'functools', 'statistics', 'base64', 'hashlib', 'string', 'csv',
  // third-party (installed)
  'numpy', 'requests', 'PIL.Image', 'matplotlib', 'cv2', 'scipy', 'sympy',
  'networkx', 'polars', 'openpyxl', 'paramiko', 'pypdf', 'cowsay', 'shapely',
  'yt_dlp', 'ezdxf',
];

let totalEntries = 0, totalTypes = 0, totalGen = 0, libFail = 0, genFail = 0, shapeFail = 0;
const rows = [];

for (const mod of MODULES) {
  const row = { mod, entries: 0, types: 0, cats: 0, gen: 0, genErr: 0, shapeErr: 0, status: 'ok', note: '' };
  let spec;
  try {
    spec = await introspectModule(mod, { maxEntries: 500 });
  } catch (e) {
    row.status = 'INTROSPECT-FAIL';
    row.note = String(e.message || e).split('\n').pop().slice(0, 60);
    libFail++; rows.push(row); continue;
  }
  const bad = validateSpec(spec);
  if (bad) { row.status = 'INVALID-SPEC'; row.note = bad; libFail++; rows.push(row); continue; }
  row.entries = spec.entries.length;
  totalEntries += spec.entries.length;

  const B = makeBlockly();
  let types;
  try { types = defineBlocks(B, spec).types; }
  catch (e) { row.status = 'DEFINE-FAIL'; row.note = String(e.message).slice(0, 60); libFail++; rows.push(row); continue; }
  row.types = types.length; totalTypes += types.length;

  // unique type-name check (collision safety on a real, large surface)
  if (new Set(types).size !== types.length) { row.status = 'TYPE-COLLISION'; }

  const tb = buildToolbox(spec);
  row.cats = tb.contents.length;

  // run init() + the generator for every entry
  for (let i = 0; i < spec.entries.length; i++) {
    const t = types[i];
    let shape;
    try { shape = buildShape(B, t); }
    catch (e) { row.shapeErr++; shapeFail++; continue; }
    // statement/output must match entry.returns
    const e = spec.entries[i];
    if (e.returns !== shape.output) { row.note = row.note || `returns/shape mismatch @${e.name}`; }
    try {
      const g = B.Python.forBlock[t];
      const out = g({}, fakeGen(shape));
      const code = Array.isArray(out) ? out[0] : out;
      if (typeof code !== 'string' || !code.includes(e.name)) { row.genErr++; genFail++; continue; }
      row.gen++; totalGen++;
    } catch (err) { row.genErr++; genFail++; }
  }
  if (row.shapeErr || row.genErr) row.status = row.status === 'ok' ? 'PARTIAL' : row.status;
  rows.push(row);
}

// report
const pad = (s, n) => String(s).padEnd(n);
const padn = (s, n) => String(s).padStart(n);
console.log(pad('module', 16), padn('entries', 8), padn('types', 6), padn('cats', 5), padn('gen-ok', 7), padn('genErr', 7), padn('shErr', 6), ' status');
console.log('-'.repeat(80));
for (const r of rows) {
  console.log(pad(r.mod, 16), padn(r.entries, 8), padn(r.types, 6), padn(r.cats, 5), padn(r.gen, 7), padn(r.genErr, 7), padn(r.shapeErr, 6), ' ' + r.status + (r.note ? '  (' + r.note + ')' : ''));
}
console.log('-'.repeat(80));
console.log(`libraries: ${MODULES.length} | introspected ok: ${MODULES.length - libFail} | failed: ${libFail}`);
console.log(`entries: ${totalEntries} | blocks defined: ${totalTypes} | codegen ok: ${totalGen} | codegen err: ${genFail} | shape err: ${shapeFail}`);
