# Defense Study Guide — BlockPy Dissertation

A topic-by-topic mastery guide for **presenting and defending** a dissertation on *provably-lossless bidirectional Python↔Blockly transformation* as the spine for three pillars:
- **(B) Oracle-gated library→block synthesis** — an LLM proposes block specs for an arbitrary pip-installed library, grounded by Pyodide runtime introspection + a user "purpose" prompt; the lossless parser is the *verification oracle* (only specs whose Python template parses and round-trips losslessly are accepted, so hallucinations are rejected by construction).
- **(①) Self-hosting block libraries** — classes/functions round-trip, so a user authors a library entirely in blocks, exports Python, and re-consumes it through the same introspection pipeline (reflective block language).
- **(②) Verified LLM "vibe coding"** — NL intent → LLM Python → losslessly editable blocks → edit → regenerate → run (Pyodide). The oracle guarantees *representation fidelity* (text↔block), **not** program correctness (that needs the execution loop). This distinction is the spine of the entire defense.

> **The one sentence you must be able to say flawlessly:** "My oracle proves that the *block representation is faithful to the text* — it does not, and cannot, prove the *program is correct*. Correctness is handled by the separate Pyodide execution loop. Keeping these two guarantees distinct is a deliberate design choice."

Each section gives: **(a)** why it matters here, **(b)** core concepts to explain, **(c)** likely committee questions + how to answer, **(d)** honest weak points / threats to validity.

---

## 0. The central framing you defend first (the spine)

**(a) Why it matters.** Everything depends on what "provably lossless" means and what the oracle does/doesn't guarantee. A committee will attack here first.

**(b) Core concepts.**
- *Lossless* = the composition `blocks→text→blocks` (and `text→blocks→text`) is identity on the relevant domain — a round-trip with no information loss. State it as a property of two functions `parse: Text→Blocks` and `gen: Blocks→Text`.
- *"Provably"*: be precise about the proof's strength — is it (i) a mathematical proof over the grammar, (ii) a property-tested guarantee, or (iii) an oracle-checked guarantee per artifact? Most likely your system *checks* round-trip per artifact at synthesis time (an oracle), and you have *tested* (not fully proven) the parser over a corpus. Say which honestly.
- *Representation fidelity vs. program correctness*: fidelity = text and blocks denote the same program text; correctness = the program does what the user intends. The oracle gives the first, never the second.

**(c) Likely questions.**
- "What exactly does 'provably' mean — proof or test?" → Distinguish per-artifact oracle checking (sound, runs every time) from a global proof over all Python (you almost certainly do *not* have this; say so). If you have property-based tests / fuzzing over a grammar subset, present coverage data and call it *empirical evidence of losslessness on the supported subset*, not a theorem.
- "Lossless over *what* subset of Python?" → Have a crisp answer: the exact grammar subset supported, what is explicitly out of scope (decorators? walrus? match? comments/whitespace?), and how unsupported constructs are handled (reject vs. degrade).
- "Comments and formatting are information — do you preserve them?" → This is the classic lossless gotcha (it's why LibCST exists). Be explicit whether your "lossless" is *semantic* (AST-equivalent) or *concrete* (byte-for-byte including comments). If semantic, admit comments/whitespace are normalized and argue why that's acceptable for blocks.

**(d) Threats to validity.**
- "Lossless" likely means *AST/semantic equivalence on a Python subset*, not concrete-syntax byte equality — be upfront.
- The oracle proves fidelity per artifact; it says nothing about correctness, security, or performance of the generated program.
- Coverage of the parser is measured by tests, not proven — a committee can ask for the unsupported-construct list and the failure mode.

---

## 1. Bidirectional Transformation / Lens Theory

**(a) Why it matters.** Provides the formal vocabulary and laws that make "lossless bidirectional" a rigorous claim rather than an engineering boast.

**(b) Core concepts to explain.**
- Lenses: `get: C→A`, `put: A×C→C`. Well-behavedness laws: **GetPut** (`put (get c) c = c`), **PutGet** (`get (put a c) = a`); *very well-behaved* adds PutPut. Totality.
- Where BlockPy sits: text↔blocks is (near-)*bijective*, so it's a degenerate lens — closer to an isomorphism than a lossy view. Map your `parse`/`gen` onto get/put and state which laws you satisfy.
- Asymmetric vs. symmetric lenses; state-based vs. delta-based BX (Czarnecki et al. terminology).
- Snapshot/round-trip recovery (your system restores a saved block JSON when text is structurally unchanged) is a *delta-based* optimization — be ready to describe it in BX terms.

**(c) Likely questions.**
- "Is your transformation a bijection? If so, why invoke lens theory at all?" → It's near-bijective on the supported subset; lens laws still give the precise language for the residual asymmetries (e.g., normalized whitespace means `get∘put` is identity *up to normalization*).
- "Which well-behavedness laws hold, and have you checked them?" → Name GetPut/PutGet, say how you test them (round-trip property tests), and where they can break (normalization).
- "How does this differ from Foster et al.'s lenses?" → Theirs target lossy view-update; yours targets high-fidelity dual representation *and* repurposes round-trip as a synthesis oracle.

**(d) Threats.** If the mapping isn't a clean bijection (e.g., multiple texts map to one block layout), PutPut/idempotence claims need care. Snapshot recovery can mask non-idempotence — defend why that's sound.

---

## 2. Lossless Parsing / Concrete Syntax Trees

**(a) Why it matters.** The oracle *is* a parser + generator; its fidelity is the foundation of pillar B.

**(b) Core concepts.**
- AST vs. CST: ASTs drop whitespace/comments; CSTs (LibCST, parso, lib2to3/pgen2) retain them for exact reprint.
- Why round-tripping is hard: comments, trailing commas, whitespace, string-quote style, line continuations.
- Your design choice: a hand-written tokenizer+parser producing a custom AST → Blockly JSON, rather than building on LibCST. Be ready to justify (target is Blockly JSON + custom block semantics, not Python CST; also COOP/COEP/Pyodide environment constraints).

**(c) Likely questions.**
- "Why hand-write a parser instead of using LibCST/parso?" → Target representation differs (blocks, not CST); need custom block-type mapping and generator parity; full control over the supported subset and the oracle semantics.
- "How do you guarantee parser/generator field-name parity?" → Describe the discipline: matching field keys on both `Blockly.Blocks['x']` and `Blockly.Python['x']`, and round-trip tests that catch mismatches (a known historical bug class).
- "What's your test corpus and coverage number?" → Have the number ready and state how it's measured (e.g., e2e round-trip tests; % of constructs covered).

**(d) Threats.** Hand-written parsers drift from CPython's grammar; "lossless" is only as good as the corpus. Coverage is test-measured, not proven. Comment/whitespace loss if the lens is semantic-only.

---

## 3. Block-Based / Visual PL Design & the Novice Transition

**(a) Why it matters.** The product/education contribution and the "low floor, high ceiling" positioning live here.

**(b) Core concepts.**
- "Low floor, wide walls, high ceiling" (Scratch/Resnick); "no ceiling" (Snap!/Harvey & Mönig); dual-modality (Pencil Code/Droplet, MakeCode, App Lab).
- The blocks→text transition problem (Fraser's "exit strategy"; Weintrop & Wilensky's evidence; Kölling/Brown frame-based editing as a third way).
- Field-name/shadow-block parity, sprite-turn normalization, and other round-trip-preserving design conventions specific to your system.

**(c) Likely questions.**
- "How is this different from Pencil Code/Droplet, which already does bidirectional block↔text?" → Droplet does equipotent block↔text for CoffeeScript/JS; you add Python + *library* blocks + LLM grounding + the *provable-lossless-as-oracle* reframing. Differentiation must be crisp — this is the most dangerous "isn't this already done?" question.
- "Why Python + Blockly specifically?" → Python's pedagogical/industry relevance + data-science libraries; Blockly's maturity and extensibility.
- "Does adding text↔block fidelity actually help novices, or just enable your synthesis trick?" → Cite Weintrop & Wilensky for learning gains; frame the education study as the test.

**(d) Threats.** "Just another dual-mode editor" critique — defend novelty via the oracle/synthesis/self-hosting pillars, not the editor alone. Block layout for large library-generated programs may be unwieldy (scalability/usability threat).

---

## 4. Program Synthesis & DSL/API Abstraction Generation (pillar B)

**(a) Why it matters.** Pillar B *is* a synthesis problem with an unusual oracle.

**(b) Core concepts.**
- Synthesis = find program satisfying a spec (Gulwani et al.): spec mechanism, search space, ranking.
- Your instantiation: "program" = block spec + Python template; "spec" = purpose-prompt + introspected real API; "oracle/acceptance" = parses + round-trips losslessly.
- DSL/wrapper generation; the difference between *synthesizing behavior* (classic) and *synthesizing a faithful block wrapper for an existing API* (yours).

**(c) Likely questions.**
- "Your oracle accepts anything that parses and round-trips — but a spec can round-trip and still be *wrong/useless*. How is that synthesis?" → Concede immediately: the oracle filters *representation-invalid* and *hallucinated* specs, not *semantically wrong* ones. Quality/usefulness is a separate evaluation (user purpose match, execution). This is THE key honesty point.
- "How do you choose which API subset to expose as blocks?" → This is the fuzzy LLM subset-selection step grounded by introspection + purpose prompt. Admit it's heuristic; describe how you evaluate the chosen subset (coverage of intended use, user study).
- "What's your soundness vs. coverage tradeoff?" → Oracle is *sound* (rejects everything that fails round-trip) but may *over-reject* valid-but-unusual APIs (incompleteness). Quantify rejection/acceptance rates.

**(d) Threats to validity.**
- **Oracle proves fidelity, not correctness** — repeat this; the synthesized block may faithfully represent a wrong wrapper.
- **Subset selection is fuzzy** — driven by LLM + prompt; no guarantee of completeness or optimality.
- **Coverage measured, not proven** — acceptance/rejection rates are empirical on a sample of libraries.
- **Introspection limits** — dynamic Python (metaclasses, runtime-generated methods, C-extensions under Pyodide) may not introspect cleanly.

---

## 5. Neuro-Symbolic Methods / Propose-and-Verify / Grounding

**(a) Why it matters.** The whole architecture is a neuro-symbolic propose-and-verify loop; framing it this way earns rigor points.

**(b) Core concepts.**
- Neurosymbolic programming (Chaudhuri et al.): neural proposer + symbolic component.
- Propose-and-verify: LLM proposes, deterministic verifier accepts/rejects (your parser oracle; cf. Self-Debug, Reflexion, AlphaCodium using execution/tests as verifiers).
- Grounding LLMs with tools/introspection (DocPrompting grounds in docs; you ground in *live runtime introspection*).
- Why a deterministic oracle beats fuzzy self-reflection as a feedback signal.

**(c) Likely questions.**
- "Why is your verifier better than test-based verification (AlphaCodium) or self-reflection (Reflexion)?" → Different guarantee: yours is a *deterministic, total fidelity check* (cheap, always-correct for what it checks); theirs target behavior. They're complementary — you can/do use execution (Pyodide) for the correctness side.
- "Isn't introspection-grounding just RAG over the API?" → It's stronger: not retrieved docs (which can be stale/wrong) but the *actual runtime API surface* of the installed library, verified to exist and be callable.
- "Where's the symbolic reasoning beyond a parser?" → The parser + lossless round-trip + Blockly type/connection constraints constitute the symbolic verifier.

**(d) Threats.** Grounding is only as good as Pyodide's ability to install/introspect the library; some packages won't run in WASM. The "symbolic" side is a syntactic oracle, not a semantic/SMT verifier — don't overclaim formal-methods strength.

---

## 6. LLM Code Generation, Vibe Coding, Hallucination (pillars B & ②)

**(a) Why it matters.** Pillar ② is the user-facing LLM loop; hallucination is the motivating threat.

**(b) Core concepts.**
- Hallucination taxonomy in code LLMs: non-existent packages (Spracklen et al.: ~19.7% hallucinated package recommendations, recurring → "slopsquatting"), wrong APIs/arguments, dead logic.
- "Vibe coding": NL→code→edit→run loops; the risk of unverifiable LLM output.
- How your oracle rejects *representation-level* hallucinations by construction (only real, introspectable APIs; only parseable, round-tripping specs).
- The honest boundary: semantic/logic hallucinations survive the oracle and are caught only by execution/tests.

**(c) Likely questions.**
- "LLMs hallucinate APIs — how do you stop that?" → Introspection grounding (API must exist at runtime) + parse oracle (spec must round-trip). Cite Spracklen et al. as the threat and explain rejection-by-construction.
- "But the LLM can still generate logically wrong code that round-trips fine." → Yes — that's the fidelity/correctness boundary; correctness is handled by the Pyodide execution loop and (optionally) tests, not the oracle.
- "How do you evaluate the vibe-coding loop?" → Define metrics: fidelity (round-trip pass rate), and separately correctness (execution pass rate on tasks), and usability (edit→regenerate→run user study).

**(d) Threats.**
- LLM nondeterminism / model dependence (your backend uses a MiniMax model via the Anthropic SDK shim) — results may not reproduce across models; report model + version.
- Oracle can't catch semantic hallucination; over-claiming "verified vibe coding" would be misleading — say "verified *fidelity*, separately tested correctness."
- Prompt/purpose sensitivity; confounded by model capability improvements over time.

---

## 7. CS-Education Research Methodology (the user study)

**(a) Why it matters.** Classroom deployment doubles as the user study; weak methodology sinks the contribution.

**(b) Core concepts.**
- Controlled/quasi-experimental design: isomorphic conditions, pre/post assessments, transfer/"commutative" assessments (Weintrop & Wilensky template).
- Learning vs. transfer vs. interest measurement; effect sizes; statistical power.
- Validity: internal (confounds), external (generalization), construct (does the instrument measure learning?), ecological (real classroom).
- IRB/ethics: consent, minors, data handling, equitable access (no one denied the better tool).

**(c) Likely questions.**
- "How do you separate 'the tool helped' from teacher/novelty/selection effects?" → Control condition, randomization or matched cohorts, same teacher/curriculum/time-on-task (cite the Weintrop & Wilensky design), report effect sizes + limitations.
- "Is your sample big enough / powered?" → Have N, power analysis, and a frank statement if it's a pilot.
- "Did IRB approve, and how did you handle minors/consent?" → Have the protocol summary ready.

**(d) Threats to validity (state proactively).**
- **User-study confounds:** novelty effect, Hawthorne effect, teacher effect, self-selection, small N, single-site.
- Artifact-builder bias (you built it and ran the study).
- Learning gains may reflect the *blocks modality* (already shown by Weintrop & Wilensky) rather than *your specific contributions* — design the study to isolate the new pillars, or scope claims accordingly.

---

## 8. Systems-Paper Evaluation Methodology

**(a) Why it matters.** The artifact must be evaluated like a systems contribution, not only an education one.

**(b) Core concepts.**
- **Ablations:** oracle on/off (hallucination rejection rate with vs. without), introspection-grounding on/off, with/without self-debug execution loop.
- **Baselines:** ungrounded LLM block-spec generation; retrieval-grounded (DocPrompting-style); no-oracle acceptance.
- **Benchmark/dataset construction:** a set of pip libraries × purposes; gold block specs or human-rated usefulness; report how you built it and its biases.
- **Metrics:** *soundness* (oracle never accepts a non-round-tripping spec — should be 100% by construction; prove it), *coverage* (fraction of intended APIs successfully turned into blocks), *quality* (human-rated usefulness, execution success), *fidelity* (round-trip pass rate), efficiency (latency, token cost).

**(c) Likely questions.**
- "What's your baseline, and why is it fair?" → Same LLM/model, same prompts, oracle/grounding toggled; report the delta.
- "Soundness is trivially 100% if the oracle defines acceptance — so what?" → Agreed; the *interesting* numbers are coverage and quality and *the rejection rate of real hallucinations* (how much bad output the oracle catches that a naive pipeline would emit). Lead with that.
- "How do you measure 'lossless' empirically?" → Round-trip pass rate over a corpus + the unsupported-construct list; differential testing against CPython's AST where applicable.

**(d) Threats.**
- Benchmarks you built can be tuned to your strengths — disclose construction and consider an external/held-out set.
- Soundness-by-definition is not a result; the result is rejection efficacy + coverage + quality.
- Model/version dependence undermines reproducibility — pin and report; consider multiple models.

---

## 9. Cross-cutting "killer questions" — rapid-fire prep

1. **"Define lossless precisely. Proof or test?"** → Per-artifact oracle check (sound); corpus testing for the parser (empirical); not a global theorem over all Python.
2. **"Your oracle proves correctness, right?"** → No. Fidelity only. Correctness = Pyodide execution loop. (Trap question — never slip.)
3. **"Isn't this just Pencil Code/Droplet + an LLM?"** → Novelty = lossless-as-oracle, runtime-introspection grounding, hallucination-rejection-by-construction, self-hosting reflective libraries, Python+library scope.
4. **"What stops the LLM hallucinating an API?"** → Must exist at Pyodide runtime (introspection) AND round-trip through the parser (oracle).
5. **"What can still go wrong that you DON'T catch?"** → Semantically wrong but round-tripping code; over-rejection of unusual valid APIs; libraries that won't run in WASM; subset-selection misses.
6. **"What's the single most novel contribution?"** → Repurposing a provably-lossless bidirectional transformation as a *verification oracle* that rejects LLM hallucinations by construction, enabling reflective self-hosting and verified vibe-coding.
7. **"Where could a reviewer most fairly reject this?"** → If "provably lossless" overclaims a theorem you only tested; if coverage/quality numbers are thin; if the user study is confounded. Pre-empt all three.

---

## 10. Two-minute opening statement (memorize the shape)

"Blocks and text are two faces of the same program. If — and only if — we can move between them *without losing information*, that round-trip becomes a *verifier*. My dissertation makes Python↔Blockly transformation lossless on a defined subset and turns it into an oracle. An LLM, grounded in the *real* runtime API of any installed library, proposes block specs; the oracle accepts only those that parse and round-trip, so hallucinated APIs are rejected by construction. Because functions and classes round-trip, users can author libraries entirely in blocks and feed them back through the same pipeline — a reflective, self-hosting block language. And NL-to-code 'vibe coding' becomes editable blocks whose *representation* is guaranteed faithful, with *correctness* established separately by execution in Pyodide. The contribution is the spine — provable losslessness — and the three things it makes possible: verified synthesis, self-hosting, and verified vibe-coding. It is at once a research artifact, a product, and a classroom tool whose deployment is my user study."

---

### Companion file
See `related-work.md` (same folder) for the annotated bibliography with verified citations backing every claim above.
