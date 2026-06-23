// B (blockpy-gen → app integration): librarySpecToRegistrySpecs maps an introspected
// blockpy-gen LibrarySpec (dotted module, entries with kind/owner/params/returns) into the
// flat libRegistry spec shape ({module, func, argNames, hasOutput, title}) the app already
// round-trips. The dotted module collapses to a single-segment leaf ALIAS (the `from PIL
// import Image` form) because libRegistry.module must be one identifier; methods use the
// receiver model (recv = owner lowercased, recv is argNames[0]). Pure-node (no browser).
const { test, expect } = require('@playwright/test');
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');
require('../src/utils/libRegistry.js');
require('../src/utils/libImport.js');
const IR = global.BlockPyIR;
const reg = global.BlockPyLibRegistry;
const imp = global.BlockPyLibImport;

test.beforeEach(() => reg.clearAll());

const SPEC = {
  module: 'PIL.Image',
  entries: [
    { kind: 'function', name: 'blend', returns: true, params: [
      { name: 'im1', kind: 'positional', hasDefault: false },
      { name: 'im2', kind: 'positional', hasDefault: false },
      { name: 'alpha', kind: 'positional', hasDefault: false },
    ] },
    { kind: 'function', name: 'open', returns: true, params: [
      { name: 'fp', kind: 'positional', hasDefault: false },
      { name: 'mode', kind: 'positional', hasDefault: true },
    ] },
    { kind: 'class', name: 'Resampling', returns: true, params: [
      { name: 'args', kind: 'vararg', hasDefault: false },
      { name: 'kwargs', kind: 'kwarg', hasDefault: false },
    ] },
    { kind: 'method', owner: 'Image', name: 'resize', returns: true, params: [
      { name: 'size', kind: 'positional', hasDefault: false },
      { name: 'resample', kind: 'positional', hasDefault: true },
    ] },
    { kind: 'method', owner: 'Image', name: 'show', returns: false, params: [
      { name: 'title', kind: 'positional', hasDefault: true },
    ] },
  ],
};

const byTitle = (out, t) => out.specs.find((s) => s.title === t);

test('dotted module collapses to leaf alias + a from-import suggestion', () => {
  const out = imp.librarySpecToRegistrySpecs(SPEC);
  expect(out.alias).toBe('Image');
  expect(out.importStmt).toBe('from PIL import Image');
});

test('single-segment module uses a plain import', () => {
  const out = imp.librarySpecToRegistrySpecs({ module: 'requests', entries: [] });
  expect(out.alias).toBe('requests');
  expect(out.importStmt).toBe('import requests');
});

test('module function → module.func with required params only', () => {
  const out = imp.librarySpecToRegistrySpecs(SPEC);
  expect(byTitle(out, 'Image.blend')).toMatchObject({
    module: 'Image', func: 'blend', argNames: ['im1', 'im2', 'alpha'], hasOutput: true,
  });
  // optional `mode` dropped from a required-only mapping
  expect(byTitle(out, 'Image.open')).toMatchObject({ module: 'Image', func: 'open', argNames: ['fp'] });
});

test('class constructor → module.Class, vararg/kwarg excluded', () => {
  const out = imp.librarySpecToRegistrySpecs(SPEC);
  expect(byTitle(out, 'Image.Resampling')).toMatchObject({
    module: 'Image', func: 'Resampling', argNames: [], hasOutput: true,
  });
});

test('method → receiver model (recv = owner lowercased, recv is argNames[0])', () => {
  const out = imp.librarySpecToRegistrySpecs(SPEC);
  expect(byTitle(out, 'image.resize')).toMatchObject({
    module: 'image', func: 'resize', argNames: ['image', 'size'], hasOutput: true,
  });
  // returns:false → statement block
  expect(byTitle(out, 'image.show')).toMatchObject({
    module: 'image', func: 'show', argNames: ['image'], hasOutput: false,
  });
});

test('curation: selects a grounded subset, applies friendly labels, keeps call semantics', () => {
  const selected = [
    { ref: 'PIL.Image.blend', label: '두 이미지 블렌드', group: '합성' },
    { ref: 'PIL.Image.Image.resize', label: '크기 변경', group: '변형' },
    { ref: 'PIL.Image.NOT_REAL', label: '환각', group: 'x' },   // hallucinated → dropped
  ];
  const out = imp.curationToRegistrySpecs(SPEC, selected);
  expect(out.dropped).toEqual(['PIL.Image.NOT_REAL']);
  expect(out.specs.length).toBe(2);

  const blend = out.specs.find((s) => s.func === 'blend');
  expect(blend).toMatchObject({ module: 'Image', func: 'blend', title: '두 이미지 블렌드', group: '합성' });
  expect(blend.argNames).toEqual(['im1', 'im2', 'alpha']);   // signature from introspection, not the LLM

  const resize = out.specs.find((s) => s.func === 'resize');
  expect(resize).toMatchObject({ module: 'image', func: 'resize', title: '크기 변경', group: '변형', argNames: ['image', 'size'] });
});

test('curation specs register; friendly title is display-only — lowering stays module/func', () => {
  const out = imp.curationToRegistrySpecs(SPEC, [{ ref: 'PIL.Image.blend', label: 'BLEND!' }]);
  const res = reg.registerLibBlock(out.specs[0]);
  expect(res.ok).toBe(true);
  const stored = reg.getLibSpec(res.type);
  expect(stored.title).toBe('BLEND!');
  const call = IR.blocklyToIr({ blocks: { languageVersion: 0, blocks: [{ type: res.type, inputs: {
    ARG0: { block: { type: 'ir_name', fields: { ID: 'a' } } },
    ARG1: { block: { type: 'ir_name', fields: { ID: 'b' } } },
    ARG2: { block: { type: 'ir_name', fields: { ID: 'c' } } },
  } }] } }).body[0].value;
  expect(call.func.attr).toBe('blend');
  expect(call.func.value.id).toBe('Image');   // friendly label did NOT leak into the call
});

test('macros: compose real calls into a block tree that round-trips to the right statements', () => {
  const macros = [{
    name: 'open_resize_show', label: '열고 크기변경 후 미리보기', group: '워크플로',
    params: ['inp'],
    steps: [
      { ref: 'PIL.Image.open', assign: 'img', args: ['inp'] },
      { ref: 'PIL.Image.Image.resize', assign: 'small', args: ['img', '(64, 64)'] },
      { ref: 'PIL.Image.Image.show', assign: '', args: ['small'] },
    ],
  }];
  const out = imp.macrosToRegistry(SPEC, macros);
  expect(out.length).toBe(1);
  expect(out[0]).toMatchObject({ name: 'open_resize_show', label: '열고 크기변경 후 미리보기', group: '워크플로' });

  // round-trip the composed tree (head block + next-chain) through blocklyToIr
  const mod = IR.blocklyToIr({ blocks: { languageVersion: 0, blocks: [out[0].block] } });
  expect(mod.body.length).toBe(3);

  const s1 = mod.body[0];                       // img = Image.open(inp)
  expect(s1.type).toBe('Assign');
  expect(s1.targets[0].id).toBe('img');
  expect(s1.value.func.attr).toBe('open');
  expect(s1.value.func.value.id).toBe('Image');  // function -> alias-rooted
  expect(s1.value.args[0].id).toBe('inp');

  const s2 = mod.body[1];                       // small = img.resize((64, 64))
  expect(s2.targets[0].id).toBe('small');
  expect(s2.value.func.attr).toBe('resize');
  expect(s2.value.func.value.id).toBe('img');    // method -> receiver = ARG0
  expect(s2.value.args[0].type).toBe('Tuple');
  expect(s2.value.args[0].elts.map((e) => e.value)).toEqual([64, 64]);

  const s3 = mod.body[2];                       // small.show()
  expect(s3.type).toBe('Expr');
  expect(s3.value.func.attr).toBe('show');
  expect(s3.value.func.value.id).toBe('small');
  expect(s3.value.args.length).toBe(0);
});

test('libraryModules: every registry module a library maps to (alias + method receivers)', () => {
  expect(new Set(imp.libraryModules(SPEC))).toEqual(new Set(['Image', 'image']));
});

test('fresh registration: removeModules clears a library so re-curation overrides titles', () => {
  // 1) full blockify -> plain titles
  imp.librarySpecToRegistrySpecs(SPEC).specs.forEach((s) => reg.registerLibBlock(s));
  const t = reg.blockType({ module: 'Image', func: 'blend', hasOutput: true });
  expect(reg.getLibSpec(t).title).toBe('Image.blend');

  // 2) re-curate: remove the library first, then register the friendly-labelled subset
  const removed = reg.removeModules(imp.libraryModules(SPEC));
  expect(removed).toContain(t);
  expect(reg.getLibSpec(t)).toBeFalsy();
  imp.curationToRegistrySpecs(SPEC, [{ ref: 'PIL.Image.blend', label: '두 이미지 블렌드' }]).specs
    .forEach((s) => reg.registerLibBlock(s));
  expect(reg.getLibSpec(t).title).toBe('두 이미지 블렌드');   // friendly label now wins
});

test('removeModules leaves other libraries (and built-ins) intact', () => {
  reg.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true, title: 'cv2.imread', builtin: true });
  imp.librarySpecToRegistrySpecs(SPEC).specs.forEach((s) => reg.registerLibBlock(s));
  reg.removeModules(imp.libraryModules(SPEC));
  // PIL gone, cv2 built-in survives
  expect(reg.getLibSpec(reg.blockType({ module: 'Image', func: 'blend', hasOutput: true }))).toBeFalsy();
  expect(reg.getLibSpec(reg.blockType({ module: 'cv2', func: 'imread', hasOutput: true }))).toBeTruthy();
});

test('removeMacrosBySource clears just one library\'s macros', () => {
  reg.addMacro({ name: 'm1', label: 'L1', block: { type: 'ir_pass' }, srcModule: 'PIL.Image' });
  reg.addMacro({ name: 'm2', label: 'L2', block: { type: 'ir_pass' }, srcModule: 'numpy' });
  reg.removeMacrosBySource('PIL.Image');
  expect(reg.listMacros().map((m) => m.name)).toEqual(['m2']);
});

test('mapped specs register and round-trip through blocklyToIr losslessly', () => {
  const out = imp.librarySpecToRegistrySpecs(SPEC);
  const results = out.specs.map((s) => reg.registerLibBlock(s));
  expect(results.every((r) => r.ok)).toBe(true);

  // function: Image.blend(a, b, c)
  const blendType = reg.blockType({ module: 'Image', func: 'blend', hasOutput: true });
  const blend = IR.blocklyToIr({ blocks: { languageVersion: 0, blocks: [{ type: blendType, inputs: {
    ARG0: { block: { type: 'ir_name', fields: { ID: 'a' } } },
    ARG1: { block: { type: 'ir_name', fields: { ID: 'b' } } },
    ARG2: { block: { type: 'ir_name', fields: { ID: 'c' } } },
  } }] } }).body[0].value;
  expect(blend.func.attr).toBe('blend');
  expect(blend.func.value.id).toBe('Image');
  expect(blend.args.map((a) => a.id)).toEqual(['a', 'b', 'c']);

  // method: img.resize(s)  (receiver = ARG0's value, not the literal 'image')
  const resizeType = reg.blockType({ module: 'image', func: 'resize', hasOutput: true });
  const resize = IR.blocklyToIr({ blocks: { languageVersion: 0, blocks: [{ type: resizeType, inputs: {
    ARG0: { block: { type: 'ir_name', fields: { ID: 'img' } } },
    ARG1: { block: { type: 'ir_name', fields: { ID: 's' } } },
  } }] } }).body[0].value;
  expect(resize.func.attr).toBe('resize');
  expect(resize.func.value.id).toBe('img');
  expect(resize.args.map((a) => a.id)).toEqual(['s']);
});
