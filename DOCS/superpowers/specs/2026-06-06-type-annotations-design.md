# Type Annotations (W7) — Design

**Date:** 2026-06-06
**Status:** Approved, pre-implementation

## Goal

Close the type-annotation gaps in the Python ⇄ Blockly compiler so modern typed
Python round-trips losslessly and shows up as editable blocks (not gray `raw_*`
fallbacks).

## Scope

In scope:
- **Annotated assignment** — `x: int`, `x: int = 5`, `names: list[str] = []`
- **Return annotation** — `def f(a: int) -> str:`
- **typing names (STD-18)** — `List[int]`, `Optional[X]`, `Dict[str, int]`,
  `Union[...]` — falls out automatically once annotations parse as expressions;
  covered by tests only.

Out of scope (next iteration):
- `type Vec = list[float]` (3.12 soft-keyword type alias, MSC-06)
- Annotated attribute / subscript targets (`self.x: int`, `a[i]: int`)

## Current state (verified)

- **Parameter annotations** (`def f(a: int):`) already round-trip — params are
  stored as raw strings in `FunctionDefNode.params`, so the annotation rides
  along inside the param string and Blockly re-emits it verbatim.
- **Return annotation** fails: after `)` the parser immediately expects `:`, so
  `->` is an unexpected `-` token (the tokenizer splits `->` into `-` + `>`).
- **Annotated assignment** fails: in `parseExpressionStatement` a `:` after the
  target is unhandled, so the suite parser errors on the stray `:`.

## Design

### 1. Tokenizer (parser.js ~280)
Add `'->'` to `twoCharOps` so it tokenizes as a single symbol.

### 2. Parser

**Return annotation** — in `parseFunctionDef` (~1290), after consuming `)` and
before the trailing `:`, if the next token is `->`, parse the return type via
`parseExpression()` and store the rendered string on `FunctionDefNode.returns`
(default `null`).

**Annotated assignment** — in `parseExpressionStatement` (~1401), after parsing
the target expression, if the next token is `:` **and the target is a `Name`**,
consume `:`, parse the annotation via `parseExpression()`, then optionally
consume `=` and parse the value. Produce a new `AnnAssignNode(target,
annotation, value|null, line)`. Restricting to `Name` targets at statement top
level avoids any ambiguity with slice / dict `:`.

### 3. AST → Python (astToPython)
- `FunctionDef` signature (~2395): insert ` -> ${node.returns}` before `:` when
  `node.returns` is set.
- New `AnnAssign` case: `` `${target}: ${annotation}` `` + (` = ${value}` when
  `value !== null`).

### 4. Blocks (dedicated blocks + editable fields)

**`ann_assign`** (new, connectable statement block)
- Fields: `VAR` (text), `ANNOTATION` (text). Input: `VALUE` (optional).
- Generator: `` `${VAR}: ${ANNOTATION}` `` + (` = ${value}` when VALUE connected).
- Has prev/next connections.

**`method_def`** (extend existing)
- Add a serializable `RETURNS` field (empty = no annotation, else ` -> str`).
- Generator: `def ${name}(${params})${RETURNS}:`.
- Defs that carry a return annotation route through `method_def` (the same
  mechanism async defs already use, parser.js:3122), because the built-in
  `procedures_def*` hat blocks have no return-type slot.

### 5. astToBlockly
- New `AnnAssign` branch before the `Assign` case → `ann_assign` block.
- `FunctionDef` (~3119): route through `functionDefToMethodBlock` when
  `node.isAsync || node.returns`. `functionDefToMethodBlock` sets
  `block.fields.RETURNS = ' -> ' + stmt.returns` when present.
- Variable-collection pass (~2668): register `AnnAssign` targets as variables so
  later `variables_get` blocks resolve.

### 6. Toolbox (index.html)
Add `ann_assign` to the toolbox XML (per CLAUDE.md block-adding convention).

## Testing

- `tests/annotations.spec.js` (Node): parse → `astToPython` round-trip for every
  in-scope case plus the typing names.
- `tests/annotations_browser.spec.js` (`:3000`): `ann_assign` and
  `method_def`(RETURNS) block → code round-trip in a live workspace.
- Update `python.md`: ASG-06, FN-08 (return half), STD-18 → ✅; also correct the
  now-stale OP-19 lambda row (lambda_func block already landed) → ✅.

## Round-trip fidelity bar

Every in-scope construct must survive Python → blocks → Python unchanged
(modulo normalized whitespace), and the annotation must appear as an editable
field in the block view — not folded into an opaque string (except param
annotations, which keep their existing text-in-PARAMS behavior).
