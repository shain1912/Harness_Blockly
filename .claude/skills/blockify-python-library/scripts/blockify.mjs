// blockify.mjs — run the COMPLETE blockpy-gen pipeline for one or more Python modules and
// verify the result. For each module: introspect (real python) -> validateSpec ->
// defineBlocks (exercising each block's real init shape) -> buildToolbox -> execute EVERY
// generated Python code generator -> batch-validate every generated snippet with ast.parse.
// Writes <out>/<module>.spec.json and <out>/<module>.toolbox.json, prints a report.
//
// Usage:
//   node blockify.mjs <module...> [--out DIR] [--python BIN] [--max N] [--include-private]
// Run from anywhere; it resolves blockpy-gen/src relative to this file's repo location.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// .claude/skills/blockify-python-library/scripts -> repo root is four levels up.
const repo = resolve(here, '..', '..', '..', '..');
const SRC = join(repo, 'blockpy-gen', 'src');
const imp = (p) => import(pathToFileURL(join(SRC, p)).href);   // absolute path -> file:// URL (Windows-safe)
const { introspectModule } = await imp('introspect/introspect.js');
const { defineBlocks } = await imp('blocks/define.js');
const { buildToolbox } = await imp('blocks/toolbox.js');
const { validateSpec } = await imp('spec.js');

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
const modules = process.argv.slice(2).filter((a) => !a.startsWith('--') && process.argv[process.argv.indexOf(a) - 1] !== '--out'
  && process.argv[process.argv.indexOf(a) - 1] !== '--python' && process.argv[process.argv.indexOf(a) - 1] !== '--max');
const outDir = arg('--out', join(repo, 'tmp', 'blockify'));
const python = arg('--python', 'python');
const maxEntries = Number(arg('--max', '500'));
const includePrivate = process.argv.includes('--include-private');

if (!modules.length) { console.error('usage: node blockify.mjs <module...> [--out DIR] [--python BIN] [--max N] [--include-private]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

// A fake Blockly whose blocks actually run init() (recording the input shape) so we exercise
// the real defineBlocks init path, and whose generators we can invoke per block.
function makeBlockly() { return { Blocks: {}, Python: { forBlock: {}, ORDER_ATOMIC: 0, ORDER_NONE: 99 } }; }
function shapeOf(B, type) {
  const inputs = []; let output = false, statement = false;
  const chain = { appendField: () => chain };
  B.Blocks[type].init.call({
    appendDummyInput: () => chain, appendValueInput: (n) => { inputs.push(n); return chain; },
    setOutput: () => { output = true; }, setPreviousStatement: () => { statement = true; },
    setNextStatement: () => {}, setColour: () => {}, setTooltip: () => {},
  });
  return { inputs, output, statement };
}
// realistic-ish placeholder values so generated calls are plausible Python
const genFor = (inputs) => {
  const vals = {};
  inputs.forEach((n, i) => { vals[n] = (n === 'RECV') ? 'obj' : ['x', '1', "'s'", '[]', 'True'][i % 5]; });
  return { ORDER_ATOMIC: 0, ORDER_NONE: 99, valueToCode: (_b, n) => vals[n] || '' };
};

let anyFail = false;
for (const mod of modules) {
  const report = { module: mod };
  let spec;
  try { spec = await introspectModule(mod, { python, maxEntries, includePrivate }); }
  catch (e) { console.log(`\n[${mod}] INTROSPECT FAILED: ${String(e.message || e).split('\n').pop()}`); anyFail = true; continue; }
  const bad = validateSpec(spec);
  if (bad) { console.log(`\n[${mod}] INVALID SPEC: ${bad}`); anyFail = true; continue; }

  const B = makeBlockly();
  const { types } = defineBlocks(B, spec);
  const toolbox = buildToolbox(spec);
  const collision = new Set(types).size !== types.length;

  // run init + generator for every entry; collect generated snippets for syntax check
  const snippets = [];
  let genErr = 0, shapeMismatch = 0;
  for (let i = 0; i < spec.entries.length; i++) {
    const e = spec.entries[i], t = types[i];
    const shape = shapeOf(B, t);
    if (e.returns !== shape.output) shapeMismatch++;
    const out = B.Python.forBlock[t]({}, genFor(shape.inputs));
    const code = (Array.isArray(out) ? out[0] : out).trim();
    if (typeof code !== 'string' || !code.includes(e.name)) genErr++;
    snippets.push(code);
  }

  // batch ast.parse every snippet in one python process
  const py = spawnSync(python, ['-c',
    'import ast,json,sys\nb=[]\nfor i,c in enumerate(json.loads(sys.stdin.read())):\n try:ast.parse(c)\n except SyntaxError as e:b.append([c,str(e)])\nprint(json.dumps(b))'],
    { input: JSON.stringify(snippets), encoding: 'utf8' });
  const invalid = py.status === 0 ? JSON.parse(py.stdout) : [['<python failed>', py.stderr]];

  writeFileSync(join(outDir, mod.replace(/[^\w.]/g, '_') + '.spec.json'), JSON.stringify(spec, null, 2));
  writeFileSync(join(outDir, mod.replace(/[^\w.]/g, '_') + '.toolbox.json'), JSON.stringify(toolbox, null, 2));

  const ok = !collision && genErr === 0 && invalid.length === 0;
  if (!ok) anyFail = true;
  console.log(`\n[${mod}] ${ok ? 'OK' : 'ISSUES'}`);
  console.log(`  entries=${spec.entries.length}  blocks=${types.length}  categories=${toolbox.contents.length}`);
  console.log(`  codegen-ok=${spec.entries.length - genErr}/${spec.entries.length}  syntax-valid=${snippets.length - invalid.length}/${snippets.length}` +
    (collision ? '  TYPE-COLLISION!' : '') + (shapeMismatch ? `  returns/shape-mismatch=${shapeMismatch}` : ''));
  console.log(`  wrote ${mod}.spec.json + ${mod}.toolbox.json -> ${outDir}`);
  for (const e of spec.entries.slice(0, 4)) {
    const t = types[spec.entries.indexOf(e)];
    const out = B.Python.forBlock[t]({}, genFor(shapeOf(B, t).inputs));
    console.log(`    e.g. ${(Array.isArray(out) ? out[0] : out).trim()}`);
  }
  if (invalid.length) { console.log('  INVALID SNIPPETS:'); for (const [c, e] of invalid.slice(0, 5)) console.log(`    ${JSON.stringify(c)} -> ${e}`); }
}
process.exit(anyFail ? 1 : 0);
