# blockpy-gen

Turn a Python library into [Blockly](https://developers.google.com/blockly) blocks —
introspection-based, **zero runtime dependencies**, no Pyodide and no AI.

Point it at an importable module name; it spawns real `python` + `inspect` to read the
module's functions, classes and methods into a `LibrarySpec`, then (in the browser) injects
your Blockly to register block definitions, a categorized toolbox, and Python code
generators. Functions render as call blocks, classes as constructors, and methods as
`receiver.method(args)` blocks with the receiver as its own input.

## Why two tiers

The package is split by runtime so the browser bundle never pulls in Node/Python:

| Tier | Entry | Runtime | Depends on |
|---|---|---|---|
| `blocks` | `blockpy-gen` / `blockpy-gen/blocks` | Browser-safe, pure JS | injected Blockly (peer) |
| `introspect` | `blockpy-gen/introspect` | Node (spawns `python`) | `node:child_process`, external `python` |
| `server` | `blockpy-gen/server` | Node (`node:http`) | introspect tier |
| `blockify` | `blockpy-gen/blockify` | Node | both tiers |

The `./blocks` entry imports **no** Node modules — bundle it for the web freely. Blockly is a
(optional) peer dependency: it is always *injected*, never imported.

## Install

```bash
npm install blockpy-gen
# blockly is a peer dependency in the browser tier:
npm install blockly
# python (with the target library importable) must be on PATH for introspection.
```

## Usage

### 1. Live `/blockify` endpoint (primary UX)

Run an "Add Library" service next to your app; the browser fetches a spec on demand.

```bash
npx blockpy-gen serve --port 7799 --allow PIL.Image,numpy
```

```js
// browser
import { defineBlocks, buildToolbox } from 'blockpy-gen/blocks';
import * as Blockly from 'blockly';
import 'blockly/python';

const spec = await (await fetch('/blockify?module=PIL.Image')).json();
defineBlocks(Blockly, spec);
workspace.updateToolbox(buildToolbox(spec));
```

Or mount the middleware in an existing Express/`node:http` server:

```js
import { blockifyMiddleware } from 'blockpy-gen/server';
app.use(blockifyMiddleware({ allow: ['PIL.Image'], python: 'python3' }));
```

### 2. Node one-call

```js
import { blockify } from 'blockpy-gen/blockify';
import * as Blockly from 'blockly';

const { spec, types, toolbox } = await blockify(Blockly, 'PIL.Image', { workspace });
// blocks + generators registered on Blockly; toolbox applied to the workspace.
```

### 3. CLI

```bash
blockpy-gen PIL.Image --out pil.blocks.json      # write a LibrarySpec to a file
blockpy-gen numpy --max 50                        # print the first 50 entries as JSON
blockpy-gen serve --port 7799 --allow PIL.Image   # start the /blockify endpoint
```

## ⚠️ Security: introspection runs code

Introspecting a module **imports it**, which executes its top-level code. Treat
`/blockify` as code execution:

- Always pass an `allow` list of trusted module names. With no allowlist the server
  imports *any* requested module and prints a warning — only acceptable on a fully trusted,
  local network.
- Never expose the endpoint to untrusted clients.
- Prefer running it locally / behind your own auth, not on the open internet.

## The method receiver model

A method block is `receiver.method(args)` — the receiver is a **separate `RECV` input**,
never folded into the argument list. `self`/`cls` are stripped during introspection, so a
`Counter.bump(by=1)` block has inputs `RECV` (the counter) and `ARG0` (`by`) and generates
`c.bump(5)`, **not** `sample.bump(c, 5)`. Functions and class constructors instead generate
`module.name(args)`.

## The `returns` heuristic (and its limitation)

Whether a block is a value block (`setOutput`) or a statement block is decided from the
Python return annotation:

- `-> None` → statement block (no output).
- any other annotation, or no annotation → value block (assumed to return something).

**Known limitation:** the heuristic only reads annotations. An un-annotated function that
returns nothing still renders as a value block, and a property/attribute surfaced as a
callable still renders as a call block. Tighten a generated spec by hand when the annotation
is missing or misleading.

## Block type names

Types are deterministic and collision-safe via `blockType(module, entry)`:

- function → `lib_<module>__<name>`
- class → `lib_<module>__<name>__new`
- method → `lib_<module>__<owner>__<name>__m`

Non-identifier characters in the module name collapse to `_` (`PIL.Image` → `PIL_Image`).

## Types

`npm run types` emits `.d.ts` files to `dist/` via the TypeScript compiler (declared from the
JSDoc-typed JS sources).

## License

MIT
