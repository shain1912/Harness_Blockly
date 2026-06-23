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
