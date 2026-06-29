// Generate src/data/stdlibSpecs.json — a bundled set of LibrarySpecs for common Python standard-
// library modules, registered as built-in toolbox tabs at app startup (offline, no introspection at
// runtime). Pure-Python modules introspect cleanly; C modules (random/time) expose their methods as
// method_descriptors that `inspect.isfunction` can't see, so their essentials are hand-authored.
//
// Re-generate with: node scripts/gen-stdlib-blocks.cjs   (needs a local Python on PATH or PYTHON_CMD)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const PY = process.env.PYTHON_CMD || 'python';
const INSPECT = path.join(repo, 'blockpy-gen', 'src', 'introspect', '_inspect.py');

// Introspected modules (+ optional name whitelist to drop internal noise).
const INTROSPECT = [
  { module: 'math' },
  { module: 'statistics', only: ['mean', 'fmean', 'geometric_mean', 'harmonic_mean', 'median', 'median_low', 'median_high', 'mode', 'multimode', 'pstdev', 'pvariance', 'stdev', 'variance', 'quantiles'] },
  { module: 'json', only: ['dumps', 'loads', 'dump', 'load'] },
  { module: 'functools', only: ['reduce', 'partial', 'lru_cache', 'cmp_to_key', 'wraps'] },
  { module: 're', only: ['match', 'search', 'fullmatch', 'findall', 'finditer', 'sub', 'subn', 'split', 'compile', 'escape'] },
  { module: 'datetime' },   // 6 class constructors (date/time/datetime/timedelta/timezone/tzinfo)
];

// Hand-authored essentials for C modules whose methods introspection can't see.
const fn = (mod, name, args, returns) => ({
  kind: 'function', name, qualName: `${mod}.${name}`,
  params: args.map((a) => ({ name: a, kind: 'positional', hasDefault: false })),
  returns,
});
const HAND = [
  { module: 'random', entries: [
    fn('random', 'random', [], true), fn('random', 'randint', ['a', 'b'], true),
    fn('random', 'randrange', ['stop'], true), fn('random', 'uniform', ['a', 'b'], true),
    fn('random', 'choice', ['seq'], true), fn('random', 'choices', ['population'], true),
    fn('random', 'shuffle', ['x'], false), fn('random', 'sample', ['population', 'k'], true),
    fn('random', 'seed', ['a'], false), fn('random', 'gauss', ['mu', 'sigma'], true),
    fn('random', 'randbytes', ['n'], true),
  ] },
  { module: 'time', entries: [
    fn('time', 'time', [], true), fn('time', 'sleep', ['seconds'], false),
    fn('time', 'monotonic', [], true), fn('time', 'perf_counter', [], true),
    fn('time', 'localtime', [], true), fn('time', 'strftime', ['format'], true),
  ] },
];

function introspect(mod) {
  const out = execFileSync(PY, [INSPECT, mod, '--max=120'], { encoding: 'utf8' });
  return JSON.parse(out);
}

const specs = [];
for (const m of INTROSPECT) {
  const spec = introspect(m.module);
  if (m.only) spec.entries = spec.entries.filter((e) => m.only.includes(e.name));
  specs.push({ module: spec.module, entries: spec.entries });
  console.log(`[stdlib] ${m.module}: ${spec.entries.length} entries`);
}
for (const h of HAND) {
  specs.push(h);
  console.log(`[stdlib] ${h.module}: ${h.entries.length} entries (hand-authored)`);
}

const dest = path.join(repo, 'src', 'data', 'stdlibSpecs.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(specs, null, 1));
console.log(`[stdlib] wrote ${specs.length} module specs -> ${path.relative(repo, dest)}`);
