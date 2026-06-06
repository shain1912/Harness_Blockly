# Generate-and-verify loop — Workflow template

A template for the Workflow tool (multi-agent, deterministic orchestration). Adapt the
`ROUNDS` themes and `TARGET` to the construct under test. Requires the dev server running on
:3000 and the driver at `.claude/skills/blockpy-roundtrip-verify/scripts/ui_roundtrip_driver.mjs`.

Only run this when the user has opted into multi-agent orchestration (asked to "run a loop",
"fan out agents", "stress-test", etc.). Keep rounds bounded unless a budget is set.

```javascript
export const meta = {
  name: 'blockpy-roundtrip-loop',
  description: 'Generator agents make random Python exercising TARGET; verifier agents drive the real BlockPy UI via Playwright, screenshot the blocks, and judge round-trip correctness. Looped over rounds.',
  phases: [
    { title: 'Generate', detail: 'one generator agent per round produces diverse snippets' },
    { title: 'Verify', detail: 'one verifier agent per snippet: runs the driver, reads the screenshot, judges' },
  ],
}

const TARGET = 'TYPE ANNOTATIONS'           // <-- the construct under test
const DRIVER = '.claude/skills/blockpy-roundtrip-verify/scripts/ui_roundtrip_driver.mjs'
const OUTDIR = 'tmp/rt_shots'
const PER_ROUND = 5
const ROUNDS = [
  { n: 1, theme: 'BASIC forms of the construct.' },
  { n: 2, theme: 'GENERICS / edge types and less common shapes.' },
  { n: 3, theme: 'TRICKY combinations mixed with unrelated constructs (if/for/class).' },
]

const GEN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['snippets'],
  properties: { snippets: {
    type: 'array', minItems: PER_ROUND, maxItems: PER_ROUND,
    items: { type: 'object', additionalProperties: false, required: ['focus', 'code'],
      properties: {
        focus: { type: 'string' },
        code: { type: 'string', description: 'valid self-contained Python 3 (2-8 lines)' },
      } } } },
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['label', 'ok', 'blocksRenderedCorrectly', 'issue'],
  properties: {
    label: { type: 'string' },
    ok: { type: 'boolean' },
    blocksRenderedCorrectly: { type: 'boolean' },
    issue: { type: 'string' },
  },
}

const all = []
for (const round of ROUNDS) {
  phase('Generate')
  const gen = await agent(
    `Generate exactly ${PER_ROUND} DIVERSE, RANDOM, self-contained Python 3 snippets exercising ${TARGET}.
Round ${round.n} theme — ${round.theme}
Every snippet must contain the target construct, stay short (2-8 lines) and be valid Python 3.
Vary identifiers/types/structure; do not repeat the same shape. Return via the schema.`,
    { label: `gen:round${round.n}`, phase: 'Generate', schema: GEN_SCHEMA }
  )
  if (!gen?.snippets) { log(`round ${round.n}: no snippets`); continue }

  const verdicts = await parallel(gen.snippets.map((snip, i) => () => {
    const label = `r${round.n}_s${i + 1}`
    return agent(
      `Verify a Python snippet converts to correct BlockPy visual blocks by driving the real UI.
Snippet (label ${label}) — focus: ${snip.focus}
--- BEGIN PYTHON ---
${snip.code}
--- END PYTHON ---
Steps:
1. Write the python VERBATIM to ${OUTDIR}/${label}.py
2. Bash: node ${DRIVER} ${OUTDIR}/${label}.py ${OUTDIR} ${label}   (dev server is up on :3000)
3. Read ${OUTDIR}/${label}.json (ok, syntaxValid, regenerated, blockTypes, rawBlockCount, roundTripEquivalent, error)
4. Read the screenshot ${OUTDIR}/${label}.png and visually confirm the construct renders as proper dedicated blocks with no gray/raw block and no error banner.
5. ok=true only if the driver's ok is true AND the screenshot looks correct. Otherwise describe the issue.
Return the verdict via the schema; label must be "${label}".`,
      { label: `verify:${label}`, phase: 'Verify', schema: VERDICT_SCHEMA }
    )
  }))
  const clean = verdicts.filter(Boolean)
  all.push(...clean)
  log(`round ${round.n}: ${clean.filter(v => v.ok).length}/${clean.length} passed`)
}

const failed = all.filter(v => !v.ok)
return {
  total: all.length, passed: all.length - failed.length, failed: failed.length,
  failures: failed.map(v => ({ label: v.label, issue: v.issue })),
  all,
}
```

## Triaging failures

Not every `ok:false` is a feature bug. Sort each into:
- **Real bug** in the construct under test → fix with TDD, re-run the driver on that snippet.
- **Out-of-scope construct** the generator wandered into (unsupported syntax that fails
  hard) → note it as next-iteration work; tighten the generator prompt to avoid it.
- **False negative** from an unrelated known gap (e.g. a `range()` sub-expression rendering
  as `raw_expression`) → the target construct is fine; record why.
