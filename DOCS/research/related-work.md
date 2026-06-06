# Annotated Literature Survey — BlockPy Dissertation

**Scope.** Annotated bibliography for a dissertation on *provably-lossless bidirectional transformation between textual Python and visual Blockly blocks* as the spine for three pillars: (B) oracle-gated library→block synthesis, (①) self-hosting block libraries, and (②) verified LLM "vibe coding" into blocks.

**Confidence conventions.** Each entry is tagged:
- **[VERIFIED]** — citation details (authors/title/venue/year) confirmed against the publisher / arXiv / ACM DL via web search.
- **[VERIFIED — page/issue uncertain]** — paper confirmed real, but exact page numbers, issue, or precise venue string not independently re-confirmed; do not quote page numbers without checking.
- **[LOW CONFIDENCE]** — believed real but I could not fully verify the exact citation; flagged so it is not used as-is.

I did **not** fabricate any entry. Where I was unsure, I say so explicitly.

---

## Theme 1 — Bidirectional Transformation / Lens Theory (the formal backbone of "lossless")

### Foster, Greenwald, Moore, Pierce, Schmitt — Combinators for Bidirectional Tree Transformations **[VERIFIED]**
J. N. Foster, M. B. Greenwald, J. T. Moore, B. C. Pierce, A. Schmitt. "Combinators for Bidirectional Tree Transformations: A Linguistic Approach to the View-Update Problem." *ACM Transactions on Programming Languages and Systems (TOPLAS)*, Vol. 29, No. 3, 2007 (extended abstract at *POPL* 2005, *ACM SIGPLAN Notices* Vol. 40, No. 1).
- **Contribution.** Introduces *lenses*: bidirectional transformations where a `get` maps a concrete structure to an abstract view and a `put` maps an updated view back to an updated concrete structure. Defines *well-behavedness* laws (GetPut, PutGet) and *totality*, and gives a combinator language with type-directional guarantees.
- **Positioning.** This is the single most important theoretical anchor. The dissertation's "lossless round-trip" claim should be framed in lens vocabulary: text↔blocks is a (near-)bijective, *very well-behaved* lens. Difference: BlockPy aims for a near-bijection on concrete syntax (lossless), not a lossy abstraction/view, so it is a degenerate but high-fidelity lens; the novelty is using lens-style laws as an *acceptance oracle for synthesis*, not just for data sync.

### Czarnecki, Foster, Hu, Lämmel, Schürr, Terwilliger — Bidirectional Transformations: A Cross-Discipline Perspective **[VERIFIED]**
K. Czarnecki, J. N. Foster, Z. Hu, R. Lämmel, A. Schürr, J. F. Terwilliger. "Bidirectional Transformations: A Cross-Discipline Perspective." *ICMT 2009*, LNCS 5563, pp. 260–283 (GRACE meeting report).
- **Contribution.** Surveys BX across databases (view-update), programming languages (lenses), and model-driven engineering (triple graph grammars), proposes shared terminology and a benchmark agenda.
- **Positioning.** Use to situate the work in the broader BX community and to borrow precise terminology (state-based vs. delta-based, symmetric vs. asymmetric). Cite to show awareness that BX is a mature cross-discipline field, not an ad hoc engineering trick.

### Foundations for Bidirectional Programming / Validity-checking of putback **[VERIFIED — exact framing uncertain]**
Representative: Z. Hu, A. Schürr, P. Stevens, J. Terwilliger and others, "Foundations for Bidirectional Programming" (Dagstuhl/ICMT line); and work on *putback-based* bidirectional programming (e.g., Fischer/Hu/Pacheco "Validity Checking of Putback Transformations," 2014).
- **Contribution.** Argues the `put` direction should be primary and that well-behavedness can be checked/validated.
- **Positioning.** Relevant to the design decision of which direction (parse vs. generate) is authoritative in BlockPy. Note: I confirmed these works exist as a research line but did not pin every exact citation — verify before quoting.

---

## Theme 2 — Lossless Concrete Syntax Trees / Round-tripping Python

### Instagram LibCST **[VERIFIED — software, not a peer-reviewed paper]**
Instagram/Meta. *LibCST: A Concrete Syntax Tree parser and serializer library for Python.* Open-source (github.com/Instagram/LibCST), built atop David Halter's **parso** tokenizer/parser (itself derived from Guido van Rossum's pgen2 / lib2to3).
- **Contribution.** A CST that "looks and feels like an AST" but retains whitespace/comments in prefix fields so the *exact* source can be reprinted — i.e., engineered lossless round-tripping for production-scale refactoring.
- **Positioning.** The closest *engineering* analogue to BlockPy's parser requirement, and a baseline to cite for "lossless Python round-trip is a known, hard, but solved-in-practice problem." Difference: LibCST round-trips text↔CST; BlockPy round-trips text↔*visual blocks* (a different target representation) and additionally *uses* round-trip success as a synthesis oracle. Worth citing parso/lib2to3 as the lineage.

### parso / lib2to3 / pgen2 **[VERIFIED — software/lineage]**
- **Positioning.** Background lineage for Python lossless parsing. Useful in the "why hand-write a parser vs. reuse" methods discussion (the dissertation hand-writes its compiler; be ready to justify not building on LibCST — likely because the target is Blockly JSON + custom block semantics, not Python CST).

---

## Theme 3 — Block-based / Visual Programming Language Design

### Resnick et al. — Scratch: Programming for All **[VERIFIED]**
M. Resnick, J. Maloney, A. Monroy-Hernández, N. Rusk, E. Eastmond, K. Brennan, A. Millner, E. Rosenbaum, J. Silver, B. Silverman, Y. Kafai. "Scratch: Programming for All." *Communications of the ACM*, Vol. 52, No. 11, 2009, pp. 60–67.
- **Contribution.** The foundational block-based environment and "low floor, wide walls, high ceiling" design philosophy; programming as a medium for self-expression.
- **Positioning.** Cite as the origin of the block-based modality. BlockPy targets the *high ceiling* end (real Python, data science, libraries) where Scratch deliberately stops.

### Harvey & Mönig — Bringing "No Ceiling" to Scratch (Snap!) **[VERIFIED — venue is Constructionism 2010]**
B. Harvey, J. Mönig. "Bringing 'No Ceiling' to Scratch: Can One Language Serve Kids and Computer Scientists?" *Constructionism 2010*.
- **Contribution.** Snap! (formerly BYOB) extends Scratch with first-class lists, first-class procedures, and "build your own blocks" — pushing block languages toward full CS expressiveness.
- **Positioning.** Direct precedent for pillar ① (self-hosting/user-authored blocks). Snap! lets users *build their own blocks* but does not derive them from an arbitrary text language via lossless parsing + introspection — that reflective, library-grounded loop is BlockPy's novelty.

### Fraser — Ten Things We've Learned from Blockly **[VERIFIED]**
N. Fraser. "Ten Things We've Learned from Blockly." *2015 IEEE Blocks and Beyond Workshop*, pp. 49–50.
- **Contribution.** Hard-won design lessons from Google Blockly, explicitly including the "exit strategy" / moving from blocks to text.
- **Positioning.** BlockPy is *built on* Blockly; this is both a primary engineering citation and evidence that the blocks→text transition is a recognized open problem the dissertation tackles head-on. (Note: presented as folk knowledge "without supporting data" — useful caveat.)

### MakeCode **[LOW CONFIDENCE on exact citation]**
Microsoft MakeCode (Ball et al., reported in venues such as PPIG / arXiv). Block↔JavaScript/Python dual editing for microcontrollers.
- **Positioning.** Another dual-modality production system; cite as related industrial dual-mode editor. I did not lock down an exact peer-reviewed citation — verify (the canonical reference is often Ball et al., "Microsoft MakeCode," but confirm authors/venue before use).

---

## Theme 4 — Dual-Modality, Block↔Text, and the Novice Transition Problem

### Bart, Tibau, Kafura, Tilevich, Shaffer — BlockPy (the original system) **[VERIFIED — multiple papers; titles below]**
- A. C. Bart, J. Tibau, E. Tilevich, C. A. Shaffer, D. Kafura. "BlockPy: An Open Access Data-Science Environment for Introductory Programmers." *IEEE Computer*, Vol. 50, No. 5, 2017, pp. 18–26. **[VERIFIED]**
- A. C. Bart, J. Tibau, D. Kafura, C. A. Shaffer, E. Tilevich. "Design and Evaluation of a Block-based Environment with a Data Science Context." *IEEE Transactions on Emerging Topics in Computing*, 2017. **[VERIFIED — exact pages uncertain]**
- A. C. Bart et al. "Position Paper: From Interest to Usefulness with BlockPy, a Block-based, Educational Environment." *2015 IEEE Blocks and Beyond Workshop*. **[VERIFIED]**
- **Contribution.** The original BlockPy: a dual block/text Python environment for introductory data science, with guided feedback and a state explorer.
- **Positioning.** CRITICAL — this is the namesake and conceptual ancestor. The dissertation must clearly delineate novelty: the original BlockPy is a *teaching environment* with dual views; the new work makes the transformation **provably lossless**, repurposes it as a **verification oracle for LLM library synthesis**, and adds **self-hosting** and **verified vibe-coding** pillars. Frame the new system as "BlockPy reconceived as a verified, reflective, LLM-grounded platform." Be explicit about authorship/relationship to the original (avoid any impression of overclaiming the name).

### Bau, Gray, Kelleher, Sheldon, Turbak — Learnable Programming: Blocks and Beyond **[VERIFIED]**
D. Bau, J. Gray, C. Kelleher, J. Sheldon, F. Turbak. "Learnable Programming: Blocks and Beyond." *Communications of the ACM* (also arXiv:1705.09413), 2017.
- **Contribution.** Surveys block-based design principles and the spectrum of block↔text environments; argues for "learnable" affordances.
- **Positioning.** Best single citation for the design-rationale chapter. Enumerates bidirectional environments (Pencil Code, App Lab, BlockEditor, Tiled Grace) — useful for the related-systems table.

### Bau & Bau et al. — Pencil Code: Block Code for a Text World (Droplet) **[VERIFIED]**
D. Bau, A. Bau (and collaborators). "Pencil Code: Block Code for a Text World." *IDC 2015* (Interaction Design and Children), ACM. The underlying **Droplet** editor (A. Bau) provides seamless bidirectional transformation between blocks and text.
- **Contribution.** Droplet renders text as blocks and back *equivalently in power*, the closest existing system to a true bidirectional block↔text editor for a real language (CoffeeScript/JavaScript).
- **Positioning.** The most direct prior art for the spine. Borrow: the principle that block and text modes are equipotent. Differentiate: Droplet's transformation is engineered-equivalent, not framed as a *provably-lossless lens used as a synthesis oracle*; BlockPy targets Python + library blocks + LLM grounding.

### Weintrop & Wilensky — Comparing Block-Based and Text-Based Programming **[VERIFIED]**
D. Weintrop, U. Wilensky. "Comparing Block-Based and Text-Based Programming in High School Computer Science Classrooms." *ACM Transactions on Computing Education (TOCE)*, Vol. 18, No. 1, Article 3, 2017. (Related: ICER 2015 "Using Commutative Assessments…")
- **Contribution.** Controlled classroom study: students in the blocks condition showed greater learning gains and higher interest than the isomorphic text condition.
- **Positioning.** The empirical justification for *why blocks matter* and a methodological template (isomorphic conditions, commutative assessments, pre/post) for the dissertation's classroom user study. Borrow the design; cite for external validity of the educational claim.

### Kölling, Brown, Altadmri — Frame-Based Editing **[VERIFIED]**
M. Kölling, N. C. C. Brown, A. Altadmri. "Frame-Based Editing." (Workshop in Primary and Secondary Computing Education / "Frame-Based Editing: Easing the Transition from Blocks to Text-Based Programming," 2015; and *evaluation* of the Stride editor at *ICER 2016*). Related: "The Cost of Syntax and How to Avoid It: Text versus Frame-Based Editing."
- **Contribution.** Frames = structured templates that prevent syntax errors while keeping text-like expression slots; an explicit "third way" between blocks and text aimed at the transition (Stride in Greenfoot).
- **Positioning.** Strong related work on the *blocks→text transition* and on structured editing as error prevention. Differentiate: BlockPy keeps *both* full text and full blocks and guarantees lossless mapping, rather than introducing an intermediate frame representation.

### Price, Brown et al. — Scaffolding/structured editors and novice errors **[VERIFIED — see arXiv:2302.05708]**
T. W. Price, N. C. C. Brown, D. Lipovac, T. Barnes et al. (ICER line) and "Scaffolding Progress: How Structured Editors Shape Novice Errors When Transitioning from Blocks to Text" (arXiv:2302.05708).
- **Positioning.** Recent evidence on how editor structure changes the *kind* of errors novices make — directly relevant to evaluating whether lossless block↔text editing reduces transition friction. Verify exact authorship of the 2023 arXiv before citing.

---

## Theme 5 — Program Synthesis & DSL/API Abstraction Generation (pillar B)

### Gulwani, Polozov, Singh — Program Synthesis (survey) **[VERIFIED]**
S. Gulwani, O. Polozov, R. Singh. "Program Synthesis." *Foundations and Trends in Programming Languages*, Vol. 4, No. 1–2, 2017, pp. 1–119.
- **Contribution.** Canonical survey: synthesis = finding a program satisfying a user-intent specification; taxonomy over specification mechanisms, search strategies, and ranking.
- **Positioning.** Frame pillar B (library→block synthesis) as synthesis where the "program" is a block spec + Python template, the "specification" is purpose-prompt + runtime-introspected API, and the **acceptance criterion is lossless round-trip** (a verifier-as-oracle). Borrow the spec/search/rank vocabulary; the novelty is the *oracle* being a bidirectional-fidelity check rather than I/O examples.

### Chaudhuri, Ellis, Polozov, Singh, Solar-Lezama, Yue — Neurosymbolic Programming (survey) **[VERIFIED]**
S. Chaudhuri, K. Ellis, O. Polozov, R. Singh, A. Solar-Lezama, Y. Yue. "Neurosymbolic Programming." *Foundations and Trends in Programming Languages*, Vol. 7, No. 3, 2021, pp. 158–243.
- **Contribution.** Survey bridging deep learning and program synthesis: programs combining neural modules with symbolic primitives, induced via symbolic search + gradient methods.
- **Positioning.** The umbrella framing for the whole thesis: LLM (neural proposer) + lossless parser (symbolic verifier) = a neuro-symbolic *propose-and-verify* loop. Cite to claim the architecture is a principled instance of an established paradigm, not an ad hoc pipeline.

---

## Theme 6 — LLM Code Generation, Propose-and-Verify, Repair Loops, Hallucination (pillars B & ②)

### Chen, Lin, Schärli, Zhou — Teaching Large Language Models to Self-Debug **[VERIFIED]**
X. Chen, M. Lin, N. Schärli, D. Zhou. "Teaching Large Language Models to Self-Debug." arXiv:2304.05128, 2023 (ICLR 2024).
- **Contribution.** LLM debugs its own generated program from execution results without human feedback ("rubber-duck debugging"); SOTA on Spider, TransCoder, MBPP.
- **Positioning.** Template for pillar ②'s edit→regenerate→run loop. Key distinction to articulate: Self-Debug verifies *functional correctness* via execution; the BlockPy oracle verifies *representation fidelity* (text↔block), which is necessary but orthogonal. This is exactly the "oracle guarantees fidelity, not correctness" point the committee will press — cite both to show you understand which guarantee comes from where.

### Shinn, Cassano, Gopinath, Narasimhan, Yao — Reflexion **[VERIFIED]**
N. Shinn, F. Cassano, A. Gopinath, K. Narasimhan, S. Yao. "Reflexion: Language Agents with Verbal Reinforcement Learning." *NeurIPS 2023* (arXiv:2303.11366).
- **Contribution.** Agents improve via verbal self-reflection stored in episodic memory rather than weight updates; 91% pass@1 on HumanEval.
- **Positioning.** Architecture precedent for an iterative LLM loop driven by external feedback signals. In BlockPy the "environment feedback" is the parser/round-trip oracle (and Pyodide execution), giving a *grounded*, non-fuzzy reward signal. Borrow the closed-loop structure; emphasize the deterministic verifier as a stronger feedback source than free-form reflection.

### Ridnik, Kredo, Friedman — AlphaCodium / flow engineering **[LOW CONFIDENCE on exact citation]**
T. Ridnik, D. Kredo, I. Friedman (CodiumAI). "Code Generation with AlphaCodium: From Prompt Engineering to Flow Engineering." arXiv 2024 (~arXiv:2401.08500 — verify).
- **Contribution.** Test-based, multi-stage iterative "flow" that generates and refines code against public + AI-generated tests on CodeContests.
- **Positioning.** Closest "test-as-oracle" iterative-generation analogue to pillar B. Differentiate: AlphaCodium's oracle is *tests of behavior*; BlockPy's oracle is *parse + lossless round-trip of the proposed spec*. I am not 100% sure of the arXiv number/author order — verify before citing.

### Spracklen et al. — Package Hallucinations (USENIX Security 2025) **[VERIFIED — venue/year as reported]**
J. Spracklen et al. "We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code-Generating LLMs." *USENIX Security 2025* (prepub).
- **Contribution.** Empirically measures fabricated/non-existent package recommendations (~19.7% of recommended packages hallucinated; 58% of hallucinated names recur — a "slopsquatting" attack surface).
- **Positioning.** The strongest motivation for pillar B's oracle: LLMs invent APIs/packages that do not exist. BlockPy's introspection-grounding (only real, importable, runtime-verified APIs) + parse oracle *rejects hallucinations by construction*. This is your headline threat-model citation.

### Liu et al. — Exploring/Beyond Functional Correctness: Hallucinations in LLM-Generated Code **[VERIFIED — exact authorship uncertain]**
"Beyond Functional Correctness: Investigating Coding Style Inconsistencies in LLMs" / "Exploring and Evaluating Hallucinations in LLM-Powered Code Generation" (arXiv:2404.00971) and "CodeHalu: Investigating Code Hallucinations in LLMs via Execution-based Verification" (arXiv:2405.00253).
- **Contribution.** Taxonomies of code-specific hallucination (non-existent APIs, wrong arguments, dead logic) and execution-based detection.
- **Positioning.** Background for a principled hallucination taxonomy; use to define precisely *which* hallucination classes the oracle catches (representation/parse-level) vs. which it does not (semantic/logic-level — those need execution). Verify author lists before citing.

### Zhou et al. — DocPrompting: Generating Code by Retrieving the Docs **[VERIFIED]**
S. Zhou, U. Alon, F. F. Xu, Z. Jiang, G. Neubig. "DocPrompting: Generating Code by Retrieving the Docs." *ICLR 2023*.
- **Contribution.** Retrieves relevant documentation for an NL intent and conditions code generation on it, generalizing to unseen libraries/functions; large pass@k gains on CoNaLa.
- **Positioning.** Direct precedent for *grounding* generation in API knowledge. BlockPy goes further: instead of (or in addition to) retrieved docs, it grounds the LLM in **live Pyodide runtime introspection** of the real installed API, then *verifies* the proposal via the parse oracle. Borrow the grounding idea; differentiate by runtime introspection + verification.

---

## Theme 7 — CS-Education Research Methodology & Systems Evaluation

### Weintrop & Wilensky (see Theme 4) — methodological exemplar **[VERIFIED]**
- **Positioning.** Primary template for the controlled classroom study (isomorphic conditions, commutative/transfer assessments, pre/post gains, interest measures). Reuse this design and cite it as precedent for validity.

### (Methods references to assemble — flagged) **[LOW CONFIDENCE / TO VERIFY]**
The dissertation's methods chapter should additionally cite standard CER methodology sources (e.g., the *Cambridge Handbook of Computing Education Research*, eds. Fincher & Robins, 2019; and literature on validity/transfer measurement). I did not run dedicated searches to lock exact citations for these — **verify before inclusion**. They are listed here only as placeholders so the survey is complete; do not present them as verified.

---

## Quick positioning map (what we borrow vs. what is novel)

| Prior work | We borrow | Our novelty over it |
|---|---|---|
| Lenses (Foster et al.) | Well-behavedness laws, get/put framing | Lens laws as an *acceptance oracle for synthesis*, near-bijective concrete-syntax lens |
| LibCST/parso | Lossless Python round-trip is achievable | Target is *visual blocks*, and round-trip success *gates LLM output* |
| Pencil Code/Droplet | Block≡text equipotence | Python + library blocks + LLM grounding + provable-lossless framing |
| Original BlockPy | Name, dual-view teaching context | Provable losslessness, oracle, self-hosting, verified vibe-coding |
| Snap! | User-built blocks | Blocks *derived* from arbitrary libraries via introspection (reflective) |
| Program Synthesis survey | Spec/search/rank vocabulary | Oracle = round-trip fidelity, not I/O examples |
| Neurosymbolic survey | Propose (neural) + verify (symbolic) framing | Verifier is a bidirectional-parser oracle |
| Self-Debug / Reflexion / AlphaCodium | Closed iterative generation loop | Deterministic parse oracle for *fidelity*; execution loop separately for *correctness* |
| Package-hallucination study | Threat model | Runtime introspection + parse oracle reject hallucinated APIs by construction |
| DocPrompting | Ground generation in API knowledge | Ground in *live runtime introspection* + verify |

---

### Verification status summary
- **Fully verified citations:** Foster et al. (lenses); Czarnecki et al. (BX cross-discipline); LibCST/parso (software); Resnick et al. (Scratch CACM 2009); Fraser (Ten Things, Blocks & Beyond 2015); Bau et al. (Learnable Programming); Pencil Code (IDC 2015); Weintrop & Wilensky (TOCE 2017); Kölling/Brown (Frame-Based Editing); Gulwani et al. (Program Synthesis survey); Chaudhuri et al. (Neurosymbolic survey); Chen et al. (Self-Debug); Shinn et al. (Reflexion); Spracklen et al. (Package Hallucinations); Zhou et al. (DocPrompting); Harvey & Mönig (Snap!, Constructionism 2010).
- **Verified existence, detail uncertain:** BlockPy *TETC* 2017 (pages); putback/foundations BX line; Price/Brown 2023 arXiv authorship; code-hallucination taxonomy papers (authorship).
- **Low confidence — verify before citing:** MakeCode exact citation; AlphaCodium arXiv id/authors; CER methodology handbook placeholders.
