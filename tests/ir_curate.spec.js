// Curate safety net (pure-node). Guards the abstraction feature end to end WITHOUT a browser or an
// AI key: the deterministic heuristic curator picks a tiered subset, curationToRegistrySpecs resolves
// each ref to a real registered block, addCuration stores it, and buildIrToolbox renders the ★ tab
// with a small core face + a collapsed "더 보기" shelf. Also asserts a curated block still lowers to
// the exact call (recognition ⟂ lowering) and that constants/properties are NOT curated as calls.
const { test, expect } = require('@playwright/test');
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');
require('../src/utils/libRegistry.js');
require('../src/utils/libImport.js');
require('../src/utils/irToolbox.js');
require('../src/utils/curateHeuristic.js');
const IR = global.BlockPyIR;
const reg = global.BlockPyLibRegistry;
const imp = global.BlockPyLibImport;
const heur = global.BlockPyCurateHeuristic;

// A synthetic library with MORE than the beginner cap (8) of callables, plus a constant + property
// (which must be dropped from a call-only curation).
function fn(name, req = 0) {
  return { kind: 'function', name, module: 'demolib', qualName: `demolib.${name}`, returns: true,
    params: Array.from({ length: req }, (_, i) => ({ name: `a${i}`, kind: 'positional', hasDefault: false })) };
}
const SPEC = {
  module: 'demolib',
  entries: [
    fn('open_port'), fn('read_line'), fn('write_data', 1), fn('close_port'), fn('flush_buffer'),
    fn('get_status'), fn('set_baudrate', 1), fn('send_break'), fn('reset_device'), fn('list_ports'),
    fn('scan_bus'), fn('configure', 2),
    { kind: 'constant', name: 'DEFAULT_BAUD', module: 'demolib', qualName: 'demolib.DEFAULT_BAUD', valueType: 'int', valueRepr: '9600' },
    { kind: 'property', name: 'is_open', owner: 'Port', module: 'demolib', qualName: 'demolib.Port.is_open' },
  ],
};

test.beforeEach(() => reg.clearAll());

// Register the whole library first (Curate is a VIEW over already-registered blocks).
function registerFull() {
  for (const s of imp.librarySpecToRegistrySpecs(SPEC).specs) reg.registerLibBlock(s);
  for (const c of imp.librarySpecToRegistrySpecs(SPEC).consts) reg.registerConst(c);
  for (const p of imp.librarySpecToRegistrySpecs(SPEC).props) reg.registerProp(p);
}

test('heuristic curate tiers callables core/more and drops non-callables', () => {
  const out = heur.curate(SPEC, { purpose: 'open a serial port and read data', level: 'beginner' });
  expect(out.success).toBe(true);
  expect(out.heuristic).toBe(true);
  // 12 callables (> cap 8) → 8 core + rest more; constant + property excluded.
  const core = out.selected.filter((s) => s.tier === 'core');
  const more = out.selected.filter((s) => s.tier === 'more');
  expect(core.length).toBe(8);
  expect(more.length).toBeGreaterThan(0);
  const refs = out.selected.map((s) => s.ref);
  expect(refs).not.toContain('demolib.DEFAULT_BAUD');       // constant not curated as a call
  expect(refs).not.toContain('demolib.Port.is_open');       // property not curated as a call
  // purpose keyword overlap ranks the matching ops into core.
  expect(core.map((s) => s.ref)).toContain('demolib.read_line');
});

test('curated ★ tab renders a small core face + a collapsed 더 보기 shelf', () => {
  registerFull();
  const cdata = heur.curate(SPEC, { purpose: 'open a serial port and read data', level: 'beginner' });
  const chosen = cdata.selected.map((s) => ({ ref: s.ref, group: s.group || '', tier: s.tier }));
  const cur = imp.curationToRegistrySpecs(SPEC, chosen);
  const items = [];
  for (const s of cur.specs) { const type = reg.blockType(s); if (reg.getLibSpec(type)) items.push({ type, label: s.title, group: s.group || '', tier: s.tier || 'core' }); }
  const res = reg.addCuration({ key: 'demolib · 초', label: 'serial (초)', lib: 'demolib', items, macros: [] });
  expect(res.ok).toBe(true);

  const tb = global.BlockPyBuildIrToolbox();
  // The ★ curation shares demolib's package, so nestByPackage groups it UNDER a "demolib" parent
  // alongside the full library — the coexistence design. Find it wherever it lives.
  let star = null;
  const findStar = (cs) => { for (const c of (cs || [])) { if (c.kind === 'category' && /^★/.test(c.name)) star = c; else if (c.contents) findStar(c.contents); } };
  findStar(tb.contents);
  expect(star, 'a ★ curated tab exists (possibly nested under its package)').toBeTruthy();
  const more = (star.contents || []).find((c) => c.name === '더 보기');
  expect(more, 'a collapsed 더 보기 shelf holds the "more" tier').toBeTruthy();
  const countBlocks = (cs) => (cs || []).reduce((n, x) => n + (x.kind === 'block' ? 1 : (x.contents ? countBlocks(x.contents) : 0)), 0);
  const coreBlocks = countBlocks((star.contents || []).filter((c) => c.name !== '더 보기'));
  expect(coreBlocks).toBeGreaterThan(0);
  expect(countBlocks(more.contents)).toBeGreaterThan(0);
});

test('a curated block lowers to the exact call (recognition ⟂ lowering)', () => {
  registerFull();
  // A curated block is the unified ir_call; lower it and confirm the Python is demolib.read_line(...).
  const cur = imp.curationToRegistrySpecs(SPEC, [{ ref: 'demolib.read_line', tier: 'core' }]);
  const spec = cur.specs.find((s) => reg.getLibSpec(reg.blockType(s)));
  expect(spec).toBeTruthy();
  // toolbox entry for this type is the unified ir_call carrying funcName demolib.read_line
  const tb = global.BlockPyBuildIrToolbox();
  let entry = null;
  const walk = (cs) => { for (const x of (cs || [])) { if (x.kind === 'block' && x.extraState && x.extraState.funcName === 'demolib.read_line') entry = x; else if (x.contents) walk(x.contents); } };
  walk(tb.contents);
  expect(entry, 'toolbox offers the curated call as ir_call demolib.read_line').toBeTruthy();
  const ir = IR.blocklyToIr({ blocks: { languageVersion: 0, blocks: [entry] } });
  const call = ir.body[0].value || ir.body[0];
  const fnNode = call.func || (call.value && call.value.func);
  expect(fnNode).toMatchObject({ type: 'Attribute', attr: 'read_line', value: { type: 'Name', id: 'demolib' } });
});
