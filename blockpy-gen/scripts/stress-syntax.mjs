// Deeper full test: generate real Python for a sample of entries across libraries and verify
// EVERY generated snippet is syntactically valid via a real `python -c "ast.parse"` batch.
import { spawnSync } from 'node:child_process';
import { introspectModule } from '../src/introspect/introspect.js';
import { defineBlocks } from '../src/blocks/define.js';

function makeBlockly() { return { Blocks: {}, Python: { forBlock: {}, ORDER_ATOMIC: 0, ORDER_NONE: 99 } }; }
function shapeOf(B, type) {
  const inputs = []; const chain = { appendField: () => chain };
  B.Blocks[type].init.call({
    appendDummyInput: () => chain, appendValueInput: (n) => { inputs.push(n); return chain; },
    setOutput: () => {}, setPreviousStatement: () => {}, setNextStatement: () => {}, setColour: () => {}, setTooltip: () => {},
  });
  return inputs;
}
// realistic-ish values so generated calls are plausible Python
const gen = (inputs) => {
  const vals = {};
  inputs.forEach((n, i) => { vals[n] = (n === 'RECV') ? 'obj' : ['x', '1', "'s'", '[]', 'True'][i % 5]; });
  return { ORDER_ATOMIC: 0, ORDER_NONE: 99, valueToCode: (_b, n) => vals[n] || '' };
};

const MODULES = ['json', 'PIL.Image', 'numpy', 'requests', 'cv2', 'networkx', 'pypdf', 'cowsay'];
const SAMPLE = 12;            // entries sampled per library (spread across the list)

const snippets = [];          // { lib, type, code }
for (const mod of MODULES) {
  const spec = await introspectModule(mod, { maxEntries: 500 });
  const B = makeBlockly();
  const { types } = defineBlocks(B, spec);
  const step = Math.max(1, Math.floor(spec.entries.length / SAMPLE));
  for (let i = 0; i < spec.entries.length; i += step) {
    const t = types[i];
    const inputs = shapeOf(B, t);
    const out = B.Python.forBlock[t]({}, gen(inputs));
    const code = (Array.isArray(out) ? out[0] : out).trim();
    snippets.push({ lib: mod, code });
  }
}

// Batch-validate every snippet's syntax in one python process.
const payload = JSON.stringify(snippets.map((s) => s.code));
const py = spawnSync('python', ['-c', `
import ast, json, sys
codes = json.loads(sys.stdin.read())
bad = []
for i, c in enumerate(codes):
    try: ast.parse(c)
    except SyntaxError as e: bad.append([i, c, str(e)])
print(json.dumps({'total': len(codes), 'bad': bad}))
`], { input: payload, encoding: 'utf8' });

if (py.status !== 0) { console.error('python failed:', py.stderr); process.exit(1); }
const res = JSON.parse(py.stdout);
console.log('sampled snippets:', res.total, '| syntactically valid:', res.total - res.bad.length, '| invalid:', res.bad.length);
console.log('\nexamples of generated Python:');
for (const s of [snippets[0], snippets[13], snippets[25], snippets[40], snippets[60], snippets[snippets.length - 1]].filter(Boolean)) {
  console.log('  [' + s.lib + ']  ' + s.code);
}
if (res.bad.length) {
  console.log('\nINVALID:');
  for (const [i, c, e] of res.bad) console.log('  ', JSON.stringify(c), '->', e);
  process.exit(1);
}
console.log('\nALL SAMPLED SNIPPETS ARE VALID PYTHON.');
