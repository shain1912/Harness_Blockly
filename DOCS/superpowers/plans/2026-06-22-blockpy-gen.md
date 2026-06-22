# blockpy-gen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone, publishable package that turns a Python module name into Blockly block definitions, a toolbox, and runnable Python code generators — with a live `/blockify` endpoint as the primary UX.

**Architecture:** Two core tiers split by runtime — `introspect` (Node, spawns real `python` + `inspect` → LibrarySpec JSON) and `blocks` (pure JS, injects Blockly → block defs + toolbox + code generators). Three entry points over the same core: a live HTTP endpoint (`server`), a Node one-call (`blockify`), and a CLI.

**Tech Stack:** Node ESM, `node:test` + `node:assert` (test), `node:child_process` (introspect), `node:http` (server). **Zero runtime dependencies** — Blockly is a peer dependency (injected, never imported), Python is external.

## Global Constraints

- Package dir: `blockpy-gen/` at repo root, self-contained `package.json` (`"type":"module"`), publishable later. **Do not modify the BlockPy app.**
- `./blocks` entry MUST NOT import `node:child_process`/`node:http`/python/pyodide (browser-bundle safe). Python/Node-only code lives in `./introspect`, `./server`, `./blockify`.
- Method blocks lower to `<receiver>.method(args)` with the receiver as a **separate `RECV` input** — never mix `self` into the arg list (Phase A invariant).
- Block type names are deterministic and collision-safe via `blockType(module, entry)`; identical entry → identical type.
- All identifiers validated against `^[A-Za-z_][A-Za-z0-9_]*$`; module may be dotted.
- Tests run with `node --test` from `blockpy-gen/`. Each task ends with a commit.

---

### Task 1: Package scaffold + LibrarySpec schema

**Files:**
- Create: `blockpy-gen/package.json`
- Create: `blockpy-gen/src/spec.js`
- Test: `blockpy-gen/test/spec.test.js`

**Interfaces:**
- Produces: `validateSpec(spec) -> string|null` (error message or null), `ENTRY_KINDS`, `PARAM_KINDS` (Sets), `IDENT` (RegExp). A LibrarySpec is `{ module:string, version?:string, entries: Entry[] }`; an Entry is `{ kind:'function'|'class'|'method', name:string, owner?:string, qualName?:string, params: {name,kind,hasDefault,default?}[], doc?:string, returns:boolean }`.

- [ ] **Step 1: Create `blockpy-gen/package.json`**

```json
{
  "name": "blockpy-gen",
  "version": "0.1.0",
  "description": "Turn a Python library into Blockly blocks (introspection-based, no Pyodide/AI).",
  "type": "module",
  "exports": {
    ".": "./src/blocks/index.js",
    "./blocks": "./src/blocks/index.js",
    "./introspect": "./src/introspect/introspect.js",
    "./server": "./src/server/blockify.js",
    "./blockify": "./src/blockify.js"
  },
  "bin": { "blockpy-gen": "./bin/blockpy-gen.js" },
  "scripts": { "test": "node --test" },
  "peerDependencies": { "blockly": ">=10" },
  "peerDependenciesMeta": { "blockly": { "optional": true } },
  "license": "MIT"
}
```

- [ ] **Step 2: Write the failing test** — `blockpy-gen/test/spec.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec } from '../src/spec.js';

const ok = { module: 'PIL.Image', entries: [
  { kind: 'function', name: 'open', params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: true },
  { kind: 'method', owner: 'Image', name: 'save', params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: false },
] };

test('valid spec returns null', () => { assert.equal(validateSpec(ok), null); });
test('rejects non-dotted-identifier module', () => { assert.match(validateSpec({ module: '1bad', entries: [] }), /module/); });
test('rejects unknown entry kind', () => {
  assert.match(validateSpec({ module: 'm', entries: [{ kind: 'macro', name: 'x', params: [], returns: true }] }), /kind/);
});
test('rejects method without owner', () => {
  assert.match(validateSpec({ module: 'm', entries: [{ kind: 'method', name: 'x', params: [], returns: true }] }), /owner/);
});
test('rejects duplicate param', () => {
  assert.match(validateSpec({ module: 'm', entries: [{ kind: 'function', name: 'f', params: [
    { name: 'a', kind: 'positional', hasDefault: false }, { name: 'a', kind: 'positional', hasDefault: false }], returns: true }] }), /duplicate/);
});
test('rejects bad param kind', () => {
  assert.match(validateSpec({ module: 'm', entries: [{ kind: 'function', name: 'f', params: [
    { name: 'a', kind: 'splat', hasDefault: false }], returns: true }] }), /param kind/);
});
```

- [ ] **Step 3: Run test to verify it fails** — `cd blockpy-gen && node --test test/spec.test.js`
Expected: FAIL — cannot find module `../src/spec.js`.

- [ ] **Step 4: Implement `blockpy-gen/src/spec.js`**

```js
// LibrarySpec schema + pure validation (no Node/python deps — browser safe).
export const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const DOTTED = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
export const ENTRY_KINDS = new Set(['function', 'class', 'method']);
export const PARAM_KINDS = new Set(['positional', 'keyword', 'vararg', 'kwarg']);

// Returns an error string, or null when the spec is well-formed.
export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') return 'spec must be an object';
  if (typeof spec.module !== 'string' || !DOTTED.test(spec.module)) return 'spec.module must be a dotted identifier';
  if (!Array.isArray(spec.entries)) return 'spec.entries must be an array';
  for (const e of spec.entries) {
    if (!e || !ENTRY_KINDS.has(e.kind)) return 'invalid entry kind: ' + (e && e.kind);
    if (typeof e.name !== 'string' || !IDENT.test(e.name)) return 'invalid entry name: ' + e.name;
    if (e.kind === 'method' && (typeof e.owner !== 'string' || !IDENT.test(e.owner))) return 'method entry needs a valid owner: ' + e.name;
    if (!Array.isArray(e.params)) return 'entry.params must be an array: ' + e.name;
    if (typeof e.returns !== 'boolean') return 'entry.returns must be a boolean: ' + e.name;
    const seen = new Set();
    for (const p of e.params) {
      if (!p || typeof p.name !== 'string' || !IDENT.test(p.name)) return 'invalid param name: ' + (p && p.name);
      if (!PARAM_KINDS.has(p.kind)) return 'invalid param kind: ' + p.kind;
      if (seen.has(p.name)) return 'duplicate param: ' + p.name;
      seen.add(p.name);
    }
  }
  return null;
}
```

- [ ] **Step 5: Run test to verify it passes** — `cd blockpy-gen && node --test test/spec.test.js`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add blockpy-gen/package.json blockpy-gen/src/spec.js blockpy-gen/test/spec.test.js
git commit -m "feat(blockpy-gen): package scaffold + LibrarySpec schema/validation"
```

---

### Task 2: Deterministic block-type naming

**Files:**
- Create: `blockpy-gen/src/blocks/naming.js`
- Test: `blockpy-gen/test/naming.test.js`

**Interfaces:**
- Produces: `blockType(moduleName: string, entry: Entry) -> string`. Function → `lib_<mod>__<name>`; class → `lib_<mod>__<name>__new`; method → `lib_<mod>__<owner>__<name>__m`. Non-identifier chars in module are collapsed to `_`.

- [ ] **Step 1: Write the failing test** — `blockpy-gen/test/naming.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockType } from '../src/blocks/naming.js';

test('function type', () => {
  assert.equal(blockType('PIL.Image', { kind: 'function', name: 'open' }), 'lib_PIL_Image__open');
});
test('class type', () => {
  assert.equal(blockType('PIL.Image', { kind: 'class', name: 'Image' }), 'lib_PIL_Image__Image__new');
});
test('method type includes owner', () => {
  assert.equal(blockType('PIL.Image', { kind: 'method', owner: 'Image', name: 'save' }), 'lib_PIL_Image__Image__save__m');
});
test('deterministic', () => {
  const e = { kind: 'function', name: 'open' };
  assert.equal(blockType('PIL.Image', e), blockType('PIL.Image', e));
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd blockpy-gen && node --test test/naming.test.js`
Expected: FAIL — cannot find `../src/blocks/naming.js`.

- [ ] **Step 3: Implement `blockpy-gen/src/blocks/naming.js`**

```js
// Deterministic, collision-safe Blockly block type for a spec entry. Pure.
const sanitize = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
export function blockType(moduleName, entry) {
  const mod = sanitize(moduleName);
  if (entry.kind === 'function') return `lib_${mod}__${entry.name}`;
  if (entry.kind === 'class') return `lib_${mod}__${entry.name}__new`;
  return `lib_${mod}__${entry.owner}__${entry.name}__m`;
}
```

- [ ] **Step 4: Run test to verify it passes** — `cd blockpy-gen && node --test test/naming.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add blockpy-gen/src/blocks/naming.js blockpy-gen/test/naming.test.js
git commit -m "feat(blockpy-gen): deterministic block-type naming"
```

---

### Task 3: Python code generator per entry

**Files:**
- Create: `blockpy-gen/src/blocks/codegen.js`
- Test: `blockpy-gen/test/codegen.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `makeGenerator(moduleName, entry) -> (block, gen) => string | [string, number]`. Reads `RECV` (methods only) + `ARG<i>` value inputs via `gen.valueToCode`. Function/class → `module.name(args)`; method → `<recv>.name(args)`. Optional (`hasDefault`) params left empty are omitted; keyword params emit `name=value`. Value form `[code, ORDER_ATOMIC]` when `entry.returns`, else statement form `code + "\n"`.

- [ ] **Step 1: Write the failing test** — `blockpy-gen/test/codegen.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGenerator } from '../src/blocks/codegen.js';

// minimal fake Python generator: ARG/RECV inputs resolved from a map.
function fakeGen(values) {
  return { ORDER_ATOMIC: 0, ORDER_NONE: 99, valueToCode: (_b, name) => values[name] || '' };
}
const block = {};

test('function call: module.func(args)', () => {
  const g = makeGenerator('PIL.Image', { kind: 'function', name: 'open',
    params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: true });
  assert.deepEqual(g(block, fakeGen({ ARG0: "'a.png'" })), ["PIL.Image.open('a.png')", 0]);
});

test('method call: receiver.method(args[1:]), receiver from RECV not args', () => {
  const g = makeGenerator('PIL.Image', { kind: 'method', owner: 'Image', name: 'save',
    params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: false });
  const code = g(block, fakeGen({ RECV: 'img', ARG0: "'out.png'" }));
  assert.equal(code, "img.save('out.png')\n");           // statement form, RECV is the receiver
});

test('optional param left empty is omitted; keyword param emits name=value', () => {
  const g = makeGenerator('m', { kind: 'function', name: 'f',
    params: [{ name: 'a', kind: 'positional', hasDefault: false }, { name: 'mode', kind: 'keyword', hasDefault: true }], returns: true });
  assert.deepEqual(g(block, fakeGen({ ARG0: 'x' })), ['m.f(x)', 0]);                 // mode omitted
  assert.deepEqual(g(block, fakeGen({ ARG0: 'x', ARG1: "'r'" })), ["m.f(x, mode='r')", 0]);
});

test('constructor: module.Class(args), value form', () => {
  const g = makeGenerator('m', { kind: 'class', name: 'C', params: [], returns: true });
  assert.deepEqual(g(block, fakeGen({})), ['m.C()', 0]);
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd blockpy-gen && node --test test/codegen.test.js`
Expected: FAIL — cannot find `../src/blocks/codegen.js`.

- [ ] **Step 3: Implement `blockpy-gen/src/blocks/codegen.js`**

```js
// Build a Blockly Python generator for one spec entry. Pure (no Blockly import; uses the
// generator instance passed at call time). Methods: ARG0.. are real args, the receiver is RECV.
export function makeGenerator(moduleName, entry) {
  return function (block, gen) {
    const ORDER_ATOMIC = gen.ORDER_ATOMIC ?? 0;
    const ORDER_NONE = gen.ORDER_NONE ?? 99;
    const parts = [];
    (entry.params || []).forEach((p, i) => {
      const code = gen.valueToCode(block, 'ARG' + i, ORDER_NONE);
      if (code === '' || code == null) {
        if (p.hasDefault) return;          // optional + empty -> omit (Python default applies)
        parts.push('None');                // required + empty -> explicit None placeholder
        return;
      }
      parts.push(p.kind === 'keyword' ? `${p.name}=${code}` : code);
    });
    const argList = parts.join(', ');
    let callee;
    if (entry.kind === 'method') {
      const recv = gen.valueToCode(block, 'RECV', ORDER_ATOMIC) || '_obj';
      callee = `${recv}.${entry.name}`;
    } else {
      callee = `${moduleName}.${entry.name}`;   // function or class constructor
    }
    const code = `${callee}(${argList})`;
    return entry.returns ? [code, ORDER_ATOMIC] : code + '\n';
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — `cd blockpy-gen && node --test test/codegen.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add blockpy-gen/src/blocks/codegen.js blockpy-gen/test/codegen.test.js
git commit -m "feat(blockpy-gen): per-entry Python code generator (receiver model for methods)"
```

---

### Task 4: defineBlocks (block definitions, injected Blockly)

**Files:**
- Create: `blockpy-gen/src/blocks/define.js`
- Create: `blockpy-gen/src/blocks/index.js`
- Test: `blockpy-gen/test/define.test.js`

**Interfaces:**
- Consumes: `blockType` (Task 2), `makeGenerator` (Task 3), `validateSpec` (Task 1).
- Produces: `defineBlocks(Blockly, spec, opts?) -> { types: string[] }`. Registers `Blockly.Blocks[type] = { init }` and `Blockly.Python.forBlock[type]` (or `Blockly.Python[type]`). Each block: a title field; for methods a `RECV` value input labeled "of"; one `ARG<i>` value input per param (label `name` or `name?` when optional); `setOutput(true)` when `entry.returns` else previous/next statement. Throws if `validateSpec` fails. `index.js` re-exports `defineBlocks`, `buildToolbox`, `validateSpec`.

- [ ] **Step 1: Write the failing test** — `blockpy-gen/test/define.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineBlocks } from '../src/blocks/define.js';

// fake Blockly that records init shape via a recording block proxy.
function fakeBlockly() {
  return { Blocks: {}, Python: { forBlock: {} } };
}
function runInit(Blockly, type) {
  const shape = { fields: [], inputs: [], output: false, statement: false };
  const block = {
    appendDummyInput: () => ({ appendField: (f) => { shape.fields.push(f); return block.__chain; } }),
    appendValueInput: (n) => { shape.inputs.push(n); return { appendField: () => {} }; },
    setOutput: () => { shape.output = true; },
    setPreviousStatement: () => { shape.statement = true; },
    setNextStatement: () => {},
    setColour: () => {}, setTooltip: () => {},
  };
  block.__chain = { appendField: () => {} };
  Blockly.Blocks[type].init.call(block);
  return shape;
}

const spec = { module: 'PIL.Image', entries: [
  { kind: 'function', name: 'open', params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: true },
  { kind: 'method', owner: 'Image', name: 'save', params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: false },
] };

test('registers a block + generator per entry', () => {
  const B = fakeBlockly();
  const { types } = defineBlocks(B, spec);
  assert.equal(types.length, 2);
  for (const t of types) { assert.ok(B.Blocks[t]); assert.equal(typeof B.Python.forBlock[t], 'function'); }
});

test('function block: output, one ARG input, no RECV', () => {
  const B = fakeBlockly();
  defineBlocks(B, spec);
  const s = runInit(B, 'lib_PIL_Image__open');
  assert.equal(s.output, true);
  assert.deepEqual(s.inputs, ['ARG0']);
});

test('method block: statement, RECV input first then ARG inputs', () => {
  const B = fakeBlockly();
  defineBlocks(B, spec);
  const s = runInit(B, 'lib_PIL_Image__Image__save__m');
  assert.equal(s.statement, true);
  assert.deepEqual(s.inputs, ['RECV', 'ARG0']);
});

test('invalid spec throws', () => {
  assert.throws(() => defineBlocks(fakeBlockly(), { module: '1bad', entries: [] }), /module/);
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd blockpy-gen && node --test test/define.test.js`
Expected: FAIL — cannot find `../src/blocks/define.js`.

- [ ] **Step 3: Implement `blockpy-gen/src/blocks/define.js`**

```js
import { validateSpec } from '../spec.js';
import { blockType } from './naming.js';
import { makeGenerator } from './codegen.js';

// Register Blockly block defs + Python generators for every entry. Blockly is INJECTED.
export function defineBlocks(Blockly, spec, opts = {}) {
  const err = validateSpec(spec);
  if (err) throw new Error('blockpy-gen: invalid spec — ' + err);
  const colour = opts.colour ?? 230;
  const types = [];
  for (const entry of spec.entries) {
    const type = blockType(spec.module, entry);
    if (Blockly && Blockly.Blocks && !Blockly.Blocks[type]) {
      Blockly.Blocks[type] = { init: makeInit(spec.module, entry, colour) };
    }
    const py = Blockly && Blockly.Python;
    if (py) {
      const g = makeGenerator(spec.module, entry);
      if (py.forBlock) py.forBlock[type] = g; else py[type] = g;
    }
    types.push(type);
  }
  return { types };
}

function makeInit(moduleName, entry, colour) {
  return function () {
    const title = entry.kind === 'method' ? `${entry.owner}.${entry.name}` : `${moduleName}.${entry.name}`;
    this.appendDummyInput().appendField(title);
    if (entry.kind === 'method') this.appendValueInput('RECV').appendField('of');
    (entry.params || []).forEach((p, i) => {
      this.appendValueInput('ARG' + i).appendField(p.name + (p.hasDefault ? '?' : ''));
    });
    if (entry.returns) this.setOutput(true, null);
    else { this.setPreviousStatement(true, null); this.setNextStatement(true, null); }
    this.setColour(colour);
    this.setTooltip(((entry.doc || '').split('\n')[0] || '').slice(0, 200));
  };
}
```

- [ ] **Step 4: Create `blockpy-gen/src/blocks/index.js`**

```js
export { defineBlocks } from './define.js';
export { buildToolbox } from './toolbox.js';
export { blockType } from './naming.js';
export { validateSpec } from '../spec.js';
```

- [ ] **Step 5: Run test to verify it passes** — `cd blockpy-gen && node --test test/define.test.js`
Expected: PASS (4 tests). (`index.js` imports `./toolbox.js` which arrives in Task 5; do not run the whole suite yet, run this file only.)

- [ ] **Step 6: Commit**

```bash
git add blockpy-gen/src/blocks/define.js blockpy-gen/src/blocks/index.js blockpy-gen/test/define.test.js
git commit -m "feat(blockpy-gen): defineBlocks (injected Blockly; receiver input for methods)"
```

---

### Task 5: buildToolbox (categories)

**Files:**
- Create: `blockpy-gen/src/blocks/toolbox.js`
- Test: `blockpy-gen/test/toolbox.test.js`

**Interfaces:**
- Consumes: `blockType` (Task 2).
- Produces: `buildToolbox(spec, opts?) -> { kind:'categoryToolbox', contents: Category[] }`. One category for module functions (`"<module> functions"`), one per class (constructor block + that class's method blocks), and one per method-owner that has no class entry. Each block ref is `{ kind:'block', type }`.

- [ ] **Step 1: Write the failing test** — `blockpy-gen/test/toolbox.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildToolbox } from '../src/blocks/toolbox.js';

const spec = { module: 'PIL.Image', entries: [
  { kind: 'function', name: 'open', params: [], returns: true },
  { kind: 'class', name: 'Image', params: [], returns: true },
  { kind: 'method', owner: 'Image', name: 'save', params: [], returns: false },
  { kind: 'method', owner: 'Image', name: 'resize', params: [], returns: true },
] };

test('toolbox has a functions category and a per-class category', () => {
  const tb = buildToolbox(spec);
  assert.equal(tb.kind, 'categoryToolbox');
  const names = tb.contents.map((c) => c.name);
  assert.ok(names.includes('PIL.Image functions'));
  assert.ok(names.includes('Image'));
});

test('class category contains the constructor + its methods', () => {
  const tb = buildToolbox(spec);
  const cls = tb.contents.find((c) => c.name === 'Image');
  const types = cls.contents.map((b) => b.type);
  assert.deepEqual(types, ['lib_PIL_Image__Image__new', 'lib_PIL_Image__Image__save__m', 'lib_PIL_Image__Image__resize__m']);
});

test('every block ref is a {kind:block,type}', () => {
  const tb = buildToolbox(spec);
  for (const c of tb.contents) for (const b of c.contents) { assert.equal(b.kind, 'block'); assert.equal(typeof b.type, 'string'); }
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd blockpy-gen && node --test test/toolbox.test.js`
Expected: FAIL — cannot find `../src/blocks/toolbox.js`.

- [ ] **Step 3: Implement `blockpy-gen/src/blocks/toolbox.js`**

```js
import { blockType } from './naming.js';

// LibrarySpec -> Blockly categoryToolbox JSON. Pure.
export function buildToolbox(spec, opts = {}) {
  const ref = (e) => ({ kind: 'block', type: blockType(spec.module, e) });
  const cat = (name, entries) => ({ kind: 'category', name, contents: entries.map(ref) });
  const fns = spec.entries.filter((e) => e.kind === 'function');
  const classes = spec.entries.filter((e) => e.kind === 'class');
  const methodsByOwner = new Map();
  for (const e of spec.entries) if (e.kind === 'method') {
    if (!methodsByOwner.has(e.owner)) methodsByOwner.set(e.owner, []);
    methodsByOwner.get(e.owner).push(e);
  }
  const contents = [];
  if (fns.length) contents.push(cat(`${spec.module} functions`, fns));
  for (const c of classes) contents.push(cat(c.name, [c, ...(methodsByOwner.get(c.name) || [])]));
  for (const [owner, ms] of methodsByOwner) if (!classes.some((c) => c.name === owner)) contents.push(cat(owner, ms));
  return { kind: 'categoryToolbox', contents };
}
```

- [ ] **Step 4: Run test to verify it passes** — `cd blockpy-gen && node --test test/toolbox.test.js`
Expected: PASS (3 tests). Now run the full pure-tier suite: `cd blockpy-gen && node --test test/spec.test.js test/naming.test.js test/codegen.test.js test/define.test.js test/toolbox.test.js` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add blockpy-gen/src/blocks/toolbox.js blockpy-gen/test/toolbox.test.js
git commit -m "feat(blockpy-gen): buildToolbox (functions + per-class categories)"
```

---

### Task 6: introspect tier (real Python → LibrarySpec)

**Files:**
- Create: `blockpy-gen/src/introspect/_inspect.py`
- Create: `blockpy-gen/src/introspect/introspect.js`
- Create: `blockpy-gen/test/fixtures/sample.py`
- Test: `blockpy-gen/test/introspect.test.js`

**Interfaces:**
- Consumes: `validateSpec` (Task 1).
- Produces: `introspectModule(name, opts?) -> Promise<LibrarySpec>`. `opts = { python='python', maxEntries=200, includePrivate=false, cwd? }`. Spawns `python _inspect.py <name> [--include-private] [--max=N]`, parses stdout JSON, runs `validateSpec` (throws on bad). Rejects with a clear error on python-not-found / import failure (stderr surfaced). Methods carry `returns` from the Python return annotation (`-> None` → false, else true/unknown → true).

- [ ] **Step 1: Create the fixture `blockpy-gen/test/fixtures/sample.py`**

```python
"""Sample module for introspection tests."""

def greet(name, excited=False):
    """Return a greeting."""
    return ("HELLO " if excited else "hello ") + name

class Counter:
    """A tiny counter."""
    def __init__(self, start=0):
        self.n = start
    def bump(self, by=1) -> int:
        """Increase and return the count."""
        self.n += by
        return self.n
    def reset(self) -> None:
        """Reset to zero."""
        self.n = 0

_private = 1
def _hidden():
    pass
```

- [ ] **Step 2: Write the failing test** — `blockpy-gen/test/introspect.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { introspectModule } from '../src/introspect/introspect.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

test('introspects functions, classes, methods; skips private; uses return annotations', async () => {
  const spec = await introspectModule('sample', { cwd: fixtures });
  assert.equal(spec.module, 'sample');
  const byName = (k, n) => spec.entries.find((e) => e.kind === k && e.name === n);

  const greet = byName('function', 'greet');
  assert.ok(greet, 'greet function present');
  assert.deepEqual(greet.params.map((p) => [p.name, p.hasDefault]), [['name', false], ['excited', true]]);

  assert.ok(byName('class', 'Counter'), 'Counter class present');
  const bump = spec.entries.find((e) => e.kind === 'method' && e.owner === 'Counter' && e.name === 'bump');
  assert.ok(bump, 'Counter.bump method present');
  assert.equal(bump.returns, true);                 // -> int
  const reset = spec.entries.find((e) => e.kind === 'method' && e.name === 'reset');
  assert.equal(reset.returns, false);               // -> None

  assert.equal(spec.entries.some((e) => e.name.startsWith('_')), false, 'no private members');
});

test('rejects an unimportable module with a clear error', async () => {
  await assert.rejects(introspectModule('definitely_not_a_real_module_xyz', { cwd: fixtures }), /import|not.*found|No module/i);
});
```

- [ ] **Step 3: Run test to verify it fails** — `cd blockpy-gen && node --test test/introspect.test.js`
Expected: FAIL — cannot find `../src/introspect/introspect.js`.

- [ ] **Step 4: Implement `blockpy-gen/src/introspect/_inspect.py`**

```python
import importlib, inspect, json, sys

def _kind(p):
    P = inspect.Parameter
    return {P.POSITIONAL_ONLY: 'positional', P.POSITIONAL_OR_KEYWORD: 'positional',
            P.VAR_POSITIONAL: 'vararg', P.KEYWORD_ONLY: 'keyword', P.VAR_KEYWORD: 'kwarg'}[p.kind]

def _params(fn):
    try:
        sig = inspect.signature(fn)
    except (ValueError, TypeError):
        return None
    out = []
    for p in sig.parameters.values():
        if p.name in ('self', 'cls'):
            continue
        out.append({'name': p.name, 'kind': _kind(p), 'hasDefault': p.default is not inspect._empty})
    return out

def _returns(fn):
    try:
        ra = inspect.signature(fn).return_annotation
    except (ValueError, TypeError):
        return True
    if ra is inspect.Signature.empty:
        return True                       # unknown -> assume it returns a value (output block)
    return ra is not None and ra is not type(None)   # '-> None' -> statement block

def _doc(o):
    d = inspect.getdoc(o) or ''
    return (d.strip().split('\n')[0] if d else '')[:200]

def main():
    name = sys.argv[1]
    include_private = '--include-private' in sys.argv
    max_entries = 200
    for a in sys.argv[2:]:
        if a.startswith('--max='):
            max_entries = int(a.split('=', 1)[1])
    mod = importlib.import_module(name)
    root = name.split('.')[0]
    def public(n): return include_private or not n.startswith('_')
    entries = []
    for n, obj in inspect.getmembers(mod):
        if not public(n):
            continue
        if inspect.isfunction(obj) or inspect.isbuiltin(obj):
            p = _params(obj)
            if p is not None:
                entries.append({'kind': 'function', 'name': n, 'qualName': name + '.' + n,
                                'params': p, 'doc': _doc(obj), 'returns': _returns(obj)})
        elif inspect.isclass(obj) and (getattr(obj, '__module__', '') or '').startswith(root):
            cp = _params(obj.__init__) if hasattr(obj, '__init__') else []
            entries.append({'kind': 'class', 'name': n, 'qualName': name + '.' + n,
                            'params': cp or [], 'doc': _doc(obj), 'returns': True})
            for mn, mo in inspect.getmembers(obj, predicate=inspect.isfunction):
                if not public(mn):
                    continue
                mp = _params(mo)
                if mp is None:
                    continue
                entries.append({'kind': 'method', 'owner': n, 'name': mn, 'qualName': name + '.' + n + '.' + mn,
                                'params': mp, 'doc': _doc(mo), 'returns': _returns(mo)})
    print(json.dumps({'module': name, 'entries': entries[:max_entries]}))

main()
```

- [ ] **Step 5: Implement `blockpy-gen/src/introspect/introspect.js`**

```js
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateSpec } from '../spec.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '_inspect.py');

// Introspect an importable Python module via a real `python` subprocess -> LibrarySpec.
export function introspectModule(name, opts = {}) {
  const { python = 'python', maxEntries = 200, includePrivate = false, cwd } = opts;
  const args = [SCRIPT, name, `--max=${maxEntries}`];
  if (includePrivate) args.push('--include-private');
  return new Promise((resolve, reject) => {
    let proc;
    try { proc = spawn(python, args, { cwd }); }
    catch (e) { return reject(new Error(`blockpy-gen: failed to spawn '${python}': ${e.message}`)); }
    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => reject(new Error(`blockpy-gen: failed to run '${python}': ${e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`blockpy-gen: introspection of '${name}' failed:\n${err.trim() || 'exit ' + code}`));
      let spec;
      try { spec = JSON.parse(out); }
      catch (e) { return reject(new Error(`blockpy-gen: bad introspection output: ${e.message}\n${out.slice(0, 200)}`)); }
      const bad = validateSpec(spec);
      if (bad) return reject(new Error('blockpy-gen: introspection produced an invalid spec — ' + bad));
      resolve(spec);
    });
  });
}
```

- [ ] **Step 6: Run test to verify it passes** — `cd blockpy-gen && node --test test/introspect.test.js`
Expected: PASS (2 tests). (Requires `python` on PATH.)

- [ ] **Step 7: Commit**

```bash
git add blockpy-gen/src/introspect/ blockpy-gen/test/introspect.test.js blockpy-gen/test/fixtures/sample.py
git commit -m "feat(blockpy-gen): introspect tier (real python inspect -> LibrarySpec)"
```

---

### Task 7: Node one-call `blockify`

**Files:**
- Create: `blockpy-gen/src/blockify.js`
- Test: `blockpy-gen/test/blockify.test.js`

**Interfaces:**
- Consumes: `introspectModule` (Task 6), `defineBlocks` + `buildToolbox` (Tasks 4-5).
- Produces: `blockify(Blockly, name, opts?) -> Promise<{ spec, types, toolbox }>`. Introspects `name`, defines blocks on `Blockly`, builds the toolbox; if `opts.workspace` has `updateToolbox`, calls it. `opts` also forwards `python/maxEntries/includePrivate/cwd/colour`.

- [ ] **Step 1: Write the failing test** — `blockpy-gen/test/blockify.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { blockify } from '../src/blockify.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('blockify introspects + defines + builds toolbox, and calls workspace.updateToolbox', async () => {
  const Blockly = { Blocks: {}, Python: { forBlock: {} } };
  let updated = null;
  const ws = { updateToolbox: (tb) => { updated = tb; } };
  const { spec, types, toolbox } = await blockify(Blockly, 'sample', { cwd: fixtures, workspace: ws });
  assert.equal(spec.module, 'sample');
  assert.ok(types.includes('lib_sample__greet'));
  assert.ok(Blockly.Blocks['lib_sample__greet']);
  assert.equal(updated, toolbox);
  assert.equal(toolbox.kind, 'categoryToolbox');
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd blockpy-gen && node --test test/blockify.test.js`
Expected: FAIL — cannot find `../src/blockify.js`.

- [ ] **Step 3: Implement `blockpy-gen/src/blockify.js`**

```js
import { introspectModule } from './introspect/introspect.js';
import { defineBlocks } from './blocks/define.js';
import { buildToolbox } from './blocks/toolbox.js';

// Node/Electron one-call: introspect a module, define its blocks on the injected Blockly, build
// (and optionally apply) the toolbox.
export async function blockify(Blockly, name, opts = {}) {
  const spec = await introspectModule(name, opts);
  const { types } = defineBlocks(Blockly, spec, opts);
  const toolbox = buildToolbox(spec, opts);
  if (opts.workspace && typeof opts.workspace.updateToolbox === 'function') opts.workspace.updateToolbox(toolbox);
  return { spec, types, toolbox };
}
```

- [ ] **Step 4: Run test to verify it passes** — `cd blockpy-gen && node --test test/blockify.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add blockpy-gen/src/blockify.js blockpy-gen/test/blockify.test.js
git commit -m "feat(blockpy-gen): Node one-call blockify(Blockly, name)"
```

---

### Task 8: server tier (`/blockify` endpoint, cache, allowlist)

**Files:**
- Create: `blockpy-gen/src/server/blockify.js`
- Test: `blockpy-gen/test/server.test.js`

**Interfaces:**
- Consumes: `introspectModule` (Task 6).
- Produces:
  - `blockifyMiddleware(opts?) -> (req, res, next)` — Express/`node:http`-compatible. Handles requests whose path is `/blockify`; on a `module` query/body it responds `200` with the LibrarySpec JSON, `400` if missing, `403` if not in `allow`, `500` on introspection error. Non-`/blockify` paths call `next?.()`.
  - `createBlockifyServer(opts?) -> http.Server` — a standalone server wrapping the middleware.
  - `opts = { python, allow=null (array of allowed modules; null = allow all + warn), cache=true, maxEntries }`. Cache key = `module` (+`includePrivate`); `?refresh=1` bypasses.

- [ ] **Step 1: Write the failing test** — `blockpy-gen/test/server.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createBlockifyServer } from '../src/server/blockify.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function withServer(opts, fn) {
  const server = createBlockifyServer({ cwd: fixtures, ...opts });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try { return await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

test('GET /blockify?module=sample returns a LibrarySpec', async () => {
  await withServer({ allow: ['sample'] }, async (base) => {
    const res = await fetch(`${base}/blockify?module=sample`);
    assert.equal(res.status, 200);
    const spec = await res.json();
    assert.equal(spec.module, 'sample');
    assert.ok(spec.entries.some((e) => e.name === 'greet'));
  });
});

test('module not in allowlist -> 403', async () => {
  await withServer({ allow: ['numpy'] }, async (base) => {
    const res = await fetch(`${base}/blockify?module=sample`);
    assert.equal(res.status, 403);
  });
});

test('missing module -> 400', async () => {
  await withServer({ allow: ['sample'] }, async (base) => {
    assert.equal((await fetch(`${base}/blockify`)).status, 400);
  });
});

test('second call is a cache hit (introspect runs once)', async () => {
  let calls = 0;
  await withServer({ allow: ['sample'], introspect: async (n, o) => { calls++; return { module: n, entries: [] }; } }, async (base) => {
    await fetch(`${base}/blockify?module=sample`);
    await fetch(`${base}/blockify?module=sample`);
    assert.equal(calls, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd blockpy-gen && node --test test/server.test.js`
Expected: FAIL — cannot find `../src/server/blockify.js`.

- [ ] **Step 3: Implement `blockpy-gen/src/server/blockify.js`**

```js
import http from 'node:http';
import { introspectModule as defaultIntrospect } from '../introspect/introspect.js';

// Live "Add Library" endpoint. Wraps introspection over HTTP with caching + an allowlist.
// `opts.introspect` is injectable for tests; defaults to the real python introspection.
export function blockifyMiddleware(opts = {}) {
  const { allow = null, cache = true, introspect = defaultIntrospect } = opts;
  const store = new Map();
  if (!allow) console.warn('[blockpy-gen] no allowlist set — /blockify will import ANY requested module (code execution). Use { allow: [...] } and a trusted network.');
  return async function (req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/blockify') { if (typeof next === 'function') return next(); res.statusCode = 404; return res.end('not found'); }
    let mod = url.searchParams.get('module');
    let includePrivate = url.searchParams.get('includePrivate') === '1';
    if (!mod && req.method === 'POST') {
      const body = await readBody(req);
      try { const j = JSON.parse(body || '{}'); mod = j.module; includePrivate = !!j.includePrivate; } catch (_) {}
    }
    const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
    if (!mod) return send(400, { error: 'missing ?module' });
    if (allow && !allow.includes(mod)) return send(403, { error: `module '${mod}' not in allowlist` });
    const key = mod + (includePrivate ? '|p' : '');
    if (cache && url.searchParams.get('refresh') !== '1' && store.has(key)) return send(200, store.get(key));
    try {
      const spec = await introspect(mod, { ...opts, includePrivate });
      if (cache) store.set(key, spec);
      send(200, spec);
    } catch (e) { send(500, { error: String(e.message || e) }); }
  };
}

function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => resolve(b)); });
}

export function createBlockifyServer(opts = {}) {
  const mw = blockifyMiddleware(opts);
  return http.createServer((req, res) => mw(req, res, null));
}
```

- [ ] **Step 4: Run test to verify it passes** — `cd blockpy-gen && node --test test/server.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add blockpy-gen/src/server/blockify.js blockpy-gen/test/server.test.js
git commit -m "feat(blockpy-gen): live /blockify server + middleware (cache, allowlist)"
```

---

### Task 9: CLI, types build, README, integration smoke

**Files:**
- Create: `blockpy-gen/bin/blockpy-gen.js`
- Create: `blockpy-gen/tsconfig.json`
- Create: `blockpy-gen/README.md`
- Test: `blockpy-gen/test/integration.test.js`

**Interfaces:**
- Consumes: `introspectModule` (Task 6), `createBlockifyServer` (Task 8), `defineBlocks`/`buildToolbox` (Tasks 4-5).
- Produces: CLI `blockpy-gen <module> [--out f] [--python p] [--max N] [--include-private]` (writes spec JSON to file or stdout) and `blockpy-gen serve [--port N] [--allow a,b] [--python p]` (starts the endpoint). `npm run types` emits `dist/**.d.ts`.

- [ ] **Step 1: Write the failing integration test** — `blockpy-gen/test/integration.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { introspectModule } from '../src/introspect/introspect.js';
import { defineBlocks } from '../src/blocks/define.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// Full chain: introspect -> defineBlocks -> the generated code is correct for fn AND method.
test('end-to-end: generated code is correct for a function and a method', async () => {
  const spec = await introspectModule('sample', { cwd: fixtures });
  const Blockly = { Blocks: {}, Python: { forBlock: {} } };
  defineBlocks(Blockly, spec);
  const gen = { ORDER_ATOMIC: 0, ORDER_NONE: 99, valueToCode: (_b, n) => ({ RECV: 'c', ARG0: '5' }[n] || '') };

  const fn = Blockly.Python.forBlock['lib_sample__greet'];
  assert.deepEqual(fn({}, gen), ['sample.greet(5)', 0]);              // module.func, value form

  const m = Blockly.Python.forBlock['lib_sample__Counter__bump__m'];
  assert.deepEqual(m({}, gen), ['c.bump(5)', 0]);                     // receiver.method, NOT sample.bump(c,5)
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd blockpy-gen && node --test test/integration.test.js`
Expected: PASS already? No — it only uses existing modules. Run it; it should PASS (it's a guard, not new code). If it FAILS, a prior task regressed — fix before continuing. (This test adds no production code; it locks the cross-tier contract.)

- [ ] **Step 3: Implement the CLI `blockpy-gen/bin/blockpy-gen.js`**

```js
#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { introspectModule } from '../src/introspect/introspect.js';
import { createBlockifyServer } from '../src/server/blockify.js';

function flag(args, name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'serve') {
    const port = Number(flag(rest, '--port')) || 7799;
    const allow = (flag(rest, '--allow') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const python = flag(rest, '--python') || 'python';
    createBlockifyServer({ allow: allow.length ? allow : null, python })
      .listen(port, () => console.log(`[blockpy-gen] serving /blockify on http://127.0.0.1:${port}` + (allow.length ? ` (allow: ${allow.join(', ')})` : ' (NO allowlist — trusted network only!)')));
    return;
  }
  const name = cmd;
  if (!name || name.startsWith('--')) { console.error('usage: blockpy-gen <module> [--out f] [--python p] [--max N] [--include-private]\n       blockpy-gen serve [--port N] [--allow a,b] [--python p]'); process.exit(2); }
  const spec = await introspectModule(name, {
    python: flag(rest, '--python') || 'python',
    maxEntries: Number(flag(rest, '--max')) || 200,
    includePrivate: rest.includes('--include-private'),
  });
  const out = flag(rest, '--out');
  const json = JSON.stringify(spec, null, 2);
  if (out) { writeFileSync(out, json); console.error(`[blockpy-gen] wrote ${spec.entries.length} entries -> ${out}`); }
  else process.stdout.write(json + '\n');
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
```

- [ ] **Step 4: Verify the CLI works (introspect + serve)**

Run: `cd blockpy-gen && node bin/blockpy-gen.js sample --out /tmp/sample.blocks.json` (run from `test/fixtures` cwd so `sample` imports — `cd blockpy-gen/test/fixtures && node ../../bin/blockpy-gen.js sample` and confirm JSON with a `greet` entry prints).
Expected: JSON containing `"name": "greet"`.

- [ ] **Step 5: Add `blockpy-gen/tsconfig.json` and a `types` script**

```json
{
  "compilerOptions": {
    "allowJs": true, "checkJs": false, "declaration": true, "emitDeclarationOnly": true,
    "outDir": "dist", "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022", "skipLibCheck": true
  },
  "include": ["src/**/*.js"]
}
```

Add to `package.json` scripts: `"types": "tsc -p tsconfig.json"`. Run `cd blockpy-gen && npx -y typescript@5 tsc -p tsconfig.json` and confirm `dist/**.d.ts` is emitted (no errors). Add `dist/` to a `blockpy-gen/.gitignore`.

- [ ] **Step 6: Write `blockpy-gen/README.md`**

Cover: the three entry points with copy-paste examples (live endpoint primary), the **security warning** (introspection imports = code execution → set `allow` + trusted network), the method receiver model, and the `returns`-from-annotation heuristic + known limitation (a property exposed as a value still renders as a callable). (Prose doc — write the actual sections, no placeholders.)

- [ ] **Step 7: Run the FULL package suite**

Run: `cd blockpy-gen && node --test`
Expected: all tests PASS across spec/naming/codegen/define/toolbox/introspect/blockify/server/integration.

- [ ] **Step 8: Commit**

```bash
git add blockpy-gen/bin blockpy-gen/tsconfig.json blockpy-gen/README.md blockpy-gen/.gitignore blockpy-gen/package.json blockpy-gen/test/integration.test.js
git commit -m "feat(blockpy-gen): CLI (introspect + serve), .d.ts build, README, integration test"
```

---

## Self-Review

**1. Spec coverage:** module-name → spec (Task 6 ✓), spec → blocks+toolbox+codegen (Tasks 3-5 ✓), live endpoint primary UX (Task 8 ✓), Node one-call (Task 7 ✓), CLI (Task 9 ✓), methods-with-receiver (Tasks 3-4, locked by Task 9 integration ✓), code-gen (a) ✓, classes+methods (b) ✓, pure/Python split (exports in Task 1, enforced by `./blocks` importing no Node modules ✓), `.d.ts` (Task 9 ✓), security allowlist (Task 8 ✓), caching (Task 8 ✓). No gaps.

**2. Placeholder scan:** Every code step contains complete code; the only prose-authored deliverable is the README (Task 9 Step 6), which lists its required sections. No TBD/TODO.

**3. Type consistency:** `validateSpec`/`blockType`/`makeGenerator`/`defineBlocks`/`buildToolbox`/`introspectModule`/`blockify`/`blockifyMiddleware`/`createBlockifyServer` signatures are used identically across tasks. Entry shape `{kind,name,owner?,params:[{name,kind,hasDefault}],returns}` is consistent from introspection (Task 6) through codegen (Task 3) and the integration guard (Task 9).
