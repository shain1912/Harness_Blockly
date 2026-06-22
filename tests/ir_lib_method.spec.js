// Phase 5 fix (A): instance-method Tier-A blocks must lower to `receiver.method(args[1:])`, not
// `module.func(allArgs)`. The AI abstracts an instance method as {title:'image.save',
// args:['image','filename']} — the receiver `image` is BOTH the title prefix and args[0]. The old
// lowering emitted `image.save(image, filename)` (receiver duplicated, bare module name) which
// fails at runtime. Detection: receiver name == argNames[0]. Pure-node (no browser).
const { test, expect } = require('@playwright/test');
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');
require('../src/utils/libRegistry.js');
const IR = global.BlockPyIR;
const reg = global.BlockPyLibRegistry;

test.beforeEach(() => reg.clearAll());

const lower = (type, argBlocks) => {
  const inputs = {};
  argBlocks.forEach((blk, i) => { inputs['ARG' + i] = { block: blk }; });
  return IR.blocklyToIr({ blocks: { languageVersion: 0, blocks: [{ type, inputs }] } }).body[0];
};
const name = (id) => ({ type: 'ir_name', fields: { ID: id } });
const str = (s) => ({ type: 'ir_const', fields: { VALUE: JSON.stringify(s) } });

test('instance-method block lowers to receiver.method(args[1:])', () => {
  const res = reg.registerLibBlock({ module: 'image', func: 'save', argNames: ['image', 'filename'], hasOutput: false, title: 'image.save' });
  expect(res.ok).toBe(true);
  const st = lower(res.type, [name('img'), str('out.png')]);
  expect(st.type).toBe('Expr');
  const call = st.value;
  expect(call.type).toBe('Call');
  expect(call.func.type).toBe('Attribute');
  expect(call.func.attr).toBe('save');
  expect(call.func.value.type).toBe('Name');
  expect(call.func.value.id).toBe('img');        // RECEIVER = ARG0's value, NOT the literal 'image'
  expect(call.args.length).toBe(1);              // receiver dropped from the arg list
  expect(call.args[0].value).toBe('out.png');
});

test('method with extra args: image.resize(width, height)', () => {
  const res = reg.registerLibBlock({ module: 'image', func: 'resize', argNames: ['image', 'width', 'height'], hasOutput: true, title: 'image.resize' });
  const call = lower(res.type, [name('img'), name('w'), name('h')]).value;
  expect(call.func.attr).toBe('resize');
  expect(call.func.value.id).toBe('img');
  expect(call.args.map((a) => a.id)).toEqual(['w', 'h']);
});

test('module-function block still lowers to module.func(allArgs)', () => {
  const res = reg.registerLibBlock({ module: 'Image', func: 'open', argNames: ['filename'], hasOutput: true, title: 'Image.open' });
  const call = lower(res.type, [str('a.png')]).value;
  expect(call.func.type).toBe('Attribute');
  expect(call.func.attr).toBe('open');
  expect(call.func.value.id).toBe('Image');      // module, not a receiver
  expect(call.args.length).toBe(1);
  expect(call.args[0].value).toBe('a.png');
});

test('detection is precise: cv2.imread (module != arg0) stays a module function', () => {
  const res = reg.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true, title: 'cv2.imread' });
  const call = lower(res.type, [str('x.png')]).value;
  expect(call.func.value.id).toBe('cv2');        // NOT treated as a receiver
  expect(call.args.length).toBe(1);
});
