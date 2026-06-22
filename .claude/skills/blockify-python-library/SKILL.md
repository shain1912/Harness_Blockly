---
name: blockify-python-library
description: >-
  Turn a Python library into Blockly blocks using the blockpy-gen engine (blockpy-gen/ in this
  repo). Given a module/package name, it introspects the real installed library, generates a
  LibrarySpec + Blockly block definitions + a categorized toolbox + Python code generators, and
  verifies every generated call is syntactically valid Python. Use this whenever the user wants
  to "블록화" / "blockify" / "make blocks for" a Python library or SDK, add a new library to the
  BlockPy toolbox, generate a LibrarySpec/toolbox JSON for a module, or check whether a library
  converts cleanly into blocks — even if they just name a library and say "turn this into
  blocks". Prefer this over hand-writing block definitions: it reads the library's real
  signatures (functions, classes, methods with the receiver model) so the blocks match the API.
---

# Blockify a Python library

`blockpy-gen` (at `blockpy-gen/` in this repo) turns an importable Python module into Blockly
blocks. This skill drives it end-to-end and proves the result is correct, so you never ship
blocks that generate broken Python.

## What it produces

For a module name (e.g. `numpy`, `PIL.Image`, `requests`):

- **LibrarySpec JSON** — the introspected API: functions, classes, methods (with params, kinds,
  defaults, `returns`).
- **Block definitions** — one Blockly block per entry, registered on an injected Blockly.
- **Toolbox JSON** — a `categoryToolbox` (a "functions" category + one category per class).
- **Python code generators** — function → `module.func(args)`, class → `module.Class(args)`,
  method → `receiver.method(args)` (the receiver is a separate `RECV` input — `self` is never
  folded into the arg list).

## The one command

Run the bundled script with one or more module names. It does the full pipeline —
introspect → defineBlocks → buildToolbox → run every generator → `ast.parse` every generated
snippet — and writes `<module>.spec.json` + `<module>.toolbox.json`.

```bash
node .claude/skills/blockify-python-library/scripts/blockify.mjs <module...> [--out DIR] [--python BIN] [--max N] [--include-private]
```

Examples:

```bash
# one library, default output dir (tmp/blockify/)
node .claude/skills/blockify-python-library/scripts/blockify.mjs PIL.Image

# several at once, custom output, a specific interpreter
node .claude/skills/blockify-python-library/scripts/blockify.mjs numpy requests cv2 --out tmp/lib --python python3
```

It exits non-zero if any module fails (introspection error, type collision, codegen error, or
an invalid generated snippet), so it doubles as a check you can gate on.

## How to use it

1. **Confirm the library is importable.** Introspection runs `import <module>`, so the package
   must be installed for the interpreter you pass (`--python`). If it's missing, the script
   reports the import error — install it (`pip install <pkg>`) or pick the right interpreter.
2. **Run the command** above for the requested module(s).
3. **Read the report.** Each module prints `OK` or `ISSUES` with: entries, blocks, categories,
   `codegen-ok=N/N`, `syntax-valid=N/N`, and a few example generated lines. Healthy output is
   all `OK` with both ratios at `N/N`.
4. **Surface the artifacts.** Tell the user where the `.spec.json` / `.toolbox.json` were
   written. The spec is the portable result; the toolbox JSON drops straight into a Blockly
   `categoryToolbox`.
5. **If there are ISSUES, investigate — don't hand-wave.** `syntax-valid` below `N/N` means the
   code generator produced invalid Python for some entry (the report prints the offending
   snippets). That is a real `blockpy-gen` bug in `blockpy-gen/src/blocks/codegen.js` — fix it
   there with a unit test, never by silently dropping the entry.

## Wiring the spec into a real app (when asked)

The spec/toolbox are consumed in the browser with an injected Blockly — `blockpy-gen` never
imports Blockly itself. Minimal shape:

```js
import { defineBlocks, buildToolbox } from 'blockpy-gen/blocks';
import * as Blockly from 'blockly';
import 'blockly/python';

const spec = /* the generated LibrarySpec JSON */;
defineBlocks(Blockly, spec);
workspace.updateToolbox(buildToolbox(spec));
```

For a live "Add Library" flow, point the browser at the `/blockify` endpoint instead — see the
user manual at `blockpy-gen/USAGE.ko.md` (한국어 사용설명서) and `blockpy-gen/README.md`.

## ⚠️ Security: introspection runs code

Introspecting a module **imports it**, which executes its top-level code. Only blockify
libraries you trust, and when exposing the `/blockify` server, always set an `allow` list and
keep it on a trusted network. Never blockify an untrusted/attacker-supplied module name.

## The two invariants worth remembering

- **Method receiver model:** a method block is `receiver.method(args)` with the receiver as a
  separate `RECV` input — never `module.method(receiver, args)`. `self`/`cls` are stripped
  during introspection.
- **`returns` heuristic:** value-block vs statement-block is decided from the return
  annotation (`-> None` ⇒ statement, anything else / unannotated ⇒ value block). An
  un-annotated function that returns nothing still renders as a value block — tighten the spec
  by hand if that matters.
