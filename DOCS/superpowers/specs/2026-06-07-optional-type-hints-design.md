# Optional Type Hints via +/- toggles (Feature A) — Design

**Date:** 2026-06-07
**Status:** Approved, pre-implementation

## Goal

Type annotations are optional in Python — a block shouldn't force them. Make the annotation
an *addable* element, toggled with the project's existing `+/-` button pattern (the same
`enableArity` mechanism used by `method_call` / `print_multi`), so a user starts from a plain
block and opts into a type hint when they want one.

This is the natural continuation of W7–W9 (which *added* annotation support but baked the
annotation into the block — `ann_assign` always shows `: type`, `method_def` always shows
the `RETURNS` field).

## Scope

- **A1 — assignment type**: a unified assignment block with a `+type` toggle. Off → `x = v`;
  on → `x: T = v` (or `x: T` with no value).
- **A2 — return type**: `method_def`'s `RETURNS` becomes a `+return` toggle instead of an
  always-visible field. Off → `def f():`; on → `def f() -> T:`.
- **A3 — parameter type / default (deferred within Feature A)**: a structured per-parameter
  mutator (`+type` / `+default` per row) is a larger redesign of `method_def`'s param area.
  Params already round-trip and are *optional by text today* (you just don't type a type),
  so A3 is a follow-on step, not part of this first cut.

Out of scope: Feature B (dedicated cv2 blocks + dropdowns) — a separate spec.

## Why the +/- toggle (not separate blocks)

Blockly's `+/-` buttons add/remove **inputs within one block**; they don't morph a block
into a different type. So "add a type to a plain assignment" must be one block that toggles
an optional annotation input — not a hop between `variables_set` and `ann_assign`. The
chosen approach unifies assignment into a single custom block carrying the toggle.

**Trade-off (accepted):** the unified assignment block uses a text `VAR` field rather than
Blockly's built-in `variables_set` variable dropdown. We lose the dropdown's
rename/management affordance but gain the consistent `+` UX and a single round-trip path.
(The codebase already favors custom blocks where the built-ins don't fit, e.g. `method_def`
over `procedures_def*`.)

## Design

### A1 — `var_assign` block (unifies and replaces `ann_assign`)
- Fields: `VAR` (text — holds `x`, or `self.x` / `a[i]` for attribute/subscript targets).
  Optional `ANNOTATION` (text, shown only when the type toggle is on). Input: `VALUE`
  (optional — omit for a bare `x: int` declaration).
- A `+type` / `-type` button toggles the annotation. State is serialized (`saveExtraState`/
  `loadExtraState` carry `hasType`), so it round-trips.
- Generator: `VAR` + (`: ANNOTATION` when hasType) + (` = value` when VALUE connected).
- Routing (`astToBlockly`): `var_assign` becomes the single block for
  - simple `Name = value` assignments (replacing the built-in `variables_set`), and
  - all `AnnAssign` nodes (Name / attribute / subscript targets), with `hasType` on.
- `ann_assign` (added in W7) is **retired** — `var_assign` supersedes it. Plain
  attribute (`set_attribute`) and plain subscript (`subscript_set`) assignments, plus
  `unpack_assign` / `multiple_assign`, are unchanged.

**Migration (this is a block-identity change):** because Name assignments move from
`variables_set` → `var_assign` and annotated ones from `ann_assign` → `var_assign`, every
test/snapshot that asserts those block types for these forms must be updated:
- `tests/annotations.spec.js`, `tests/iteration_gaps.spec.js` — change `ann_assign`
  expectations to `var_assign`.
- Any spec asserting `variables_set` for a simple `x = v` — change to `var_assign`.
- The demo snippets assert round-trip + execution (not block type), so they need no change.
The pure-Python round-trip (`astToPython`) is unaffected; `npm run test:validity` stays green.

### A2 — `method_def` `+return` toggle
- Replace the always-present `RETURNS` text field with a `+return` toggle that shows/hides
  it. State serialized (`hasReturn` in extra state). Off → no `-> T`; on → ` -> T`.
- `functionDefToMethodBlock` sets `hasReturn` + the annotation text when `node.returns` is
  present; generator emits `-> T` only when the toggle is on.

### Round-trip fidelity
Every assignment and def round-trips Python → blocks → Python unchanged. The annotation
appears as an editable field only when present; a plain `x = 5` shows no `: type` and a
plain `def f():` shows no `-> T`.

## Testing

- `tests/optional_hints.spec.js` (Node): round-trip + block-type for `x = 5` (var_assign, no
  annotation), `x: int = 5` (var_assign + annotation), `x: int` (no value), `def f():` (no
  return), `def f() -> int:` (return) — assert no `ann_assign` for Name targets and the
  toggle state matches.
- `tests/optional_hints_browser.spec.js` (`:3000`): the `+type` / `+return` buttons add the
  annotation and the workspace regenerates the annotated Python; pressing `-` removes it.
- Re-run `npm run test:validity` (deterministic gate) + existing annotation specs to confirm
  no regression in the assignment/def round-trip path.

## A3 follow-on (noted, not built now)

Structured parameter mutator: each param row gains `+type` / `+default`. Requires replacing
`method_def`'s single PARAMS text field with a per-parameter sub-block list. Tracked as the
next step after A1/A2 land.
