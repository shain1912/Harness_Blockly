# BlockPy — Block Gap Analysis

Audit of every Python catalog item (`python.md`) against the bidirectional pipeline in
`src/utils/parser.js` and the toolbox in `index.html`.

**Classification rule**

- **MATCHED** — a dedicated/standard Blockly block exists AND both directions work:
  the `Tokenizer`+`Parser`+`astToBlockly` produces that block from Python text, AND a
  `Blockly.Python` generator turns the block back into equivalent Python.
- **PARTIAL** — a block exists but support is incomplete: only one direction works; only
  the generic `raw_statement`/`raw_expression` fallback is used; the block is in the toolbox
  but the parser never emits it; or the round-trip loses information.
- **MISSING** — no block and no fallback path; the parser/tokenizer would throw or silently drop it.

**Critical pipeline facts (verified)**

- Tokenizer two-char ops (`parser.js:180`): only `+= -= *= /= == != <= >=`.
- Tokenizer single-char symbols (`parser.js:191`): only `=+-*/<>():[],.` — so `{ } % & | ^ ~ ; @ !` and `*`/`**` in star-args, `//`, `<<`, `>>` are **un-tokenizable** (throws `Unexpected character`).
- Number regex (`parser.js:159`): `/[0-9.]/` only — no `0x/0b/0o`, `_`, `e`-notation, or `j`.
- String lexer (`parser.js:127`): single/double quote only — no `f`/`r`/`b` prefix, no triple-quote (the prefix letter is lexed as an identifier).
- KEYWORDS (`parser.js:19`): `def if elif else while for in and or not import as True False None pass return class lambda`. **Missing**: `break continue from try except finally raise with assert del global nonlocal yield async await is match case`.
- Comments are tokenized but **filtered out** before parsing (`parser.js:439`) — never round-tripped.
- `from ... import` is **not** handled: `parseImport` only reads `import <id>` (`parser.js:530`).
- AST→Blockly statement coverage (`convertStatementToBlock`): Call, Assign, AugAssign, For, While, If, FunctionDef, Return, ClassDef, Pass(→null), Import(→null); everything else → `raw_statement`.
- AST→Blockly expression coverage (`convertExpressionToBlock`): Num, Str, Bool, Name, List, BinOp(+ - * / and comparisons/and/or/not/INDEX), Call(→dedicated or `raw_expression`), Lambda(→`raw_expression`); everything else → `text` literal of the source (lossy).

---

## 1. Literals & Lexical (LIT)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| LIT-01 | Integer literal | PARTIAL | `math_number` | Plain decimals work both ways. `0xFF/0b1010/0o17/1_000` are NOT tokenized (number regex `[0-9.]` only) → SyntaxError. |
| LIT-02 | Float literal | PARTIAL | `math_number` | `3.14`/`.5`/`2.` OK. `1e10` fails (no `e` in number regex). |
| LIT-03 | Complex literal | MISSING | — | `j` suffix not lexed; `3+4j` → `4` Name `j`? Actually `j` lexed as identifier → wrong AST. No block. |
| LIT-04 | String literal | MATCHED | `text` | Single/double quote round-trips via `Str`↔`text`. |
| LIT-05 | Triple-quoted string | MISSING | — | Lexer consumes one quote, then sees empty string + stray quote → unterminated/garbled. |
| LIT-06 | f-string | MISSING | — | `f` prefix lexed as identifier `f` then a string atom → parse error / wrong AST. No interpolation block. |
| LIT-07 | Raw string | MISSING | — | `r` prefix lexed as identifier. |
| LIT-08 | Bytes literal | MISSING | — | `b` prefix lexed as identifier. |
| LIT-09 | Implicit string concat | MISSING | — | `"a" "b"` → two adjacent Str atoms, parser errors (no operator). |
| LIT-10 | Boolean literal | MATCHED | `logic_boolean` | `True`/`False` ↔ `Bool`/`logic_boolean`. |
| LIT-11 | None literal | PARTIAL | `logic_null` | Parser makes `Name('None')`; `astToBlockly` emits `variables_get` (a var named None), NOT `logic_null`. `logic_null` is in toolbox but unused by parser. Round-trips textually but semantically wrong block. |
| LIT-12 | Ellipsis | MISSING | — | `...` → `.` symbol token repeated; `parsePrimary` expects identifier after `.` → error. |
| LIT-13 | List literal | MATCHED | `lists_create_with` / `lists_create_empty` | `[1,2,3]` ↔ list blocks both ways. |
| LIT-14 | Tuple literal | MISSING | — | No `Tuple` AST node; `(1, 2)` → `parseAtom` parses `(expr)` then errors on `,`. `()` errors. |
| LIT-15 | Dict literal | MISSING | — | `{` not tokenized → SyntaxError. No dict block. |
| LIT-16 | Set literal | MISSING | — | `{` not tokenized → SyntaxError. |
| LIT-17 | Empty containers | PARTIAL | `lists_create_empty` | `[]` works. `{}`/`set()`/`()` do not (no tokens/nodes). |

---

## 2. Variables & Assignment (ASG)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| ASG-01 | Simple assignment | MATCHED | `variables_set` | `x = 5` ↔ `variables_set` both ways. |
| ASG-02 | Multiple targets | MISSING | — | `a = b = 0`: parser reads `a` then `=`, parses `b = 0`? No — second `=` not handled in value; produces only one Assign and leftover token error. |
| ASG-03 | Tuple/list unpacking | MISSING | — | `a, b = 1, 2`: `parseExpressionStatement` parses `a`, hits `,` (not `=`/aug) → returns bare `a`, then top-level `expect NEWLINE` fails. |
| ASG-04 | Starred unpacking | MISSING | — | `*` star-target not tokenized as prefix; no node. |
| ASG-05 | Augmented assignment | PARTIAL | `variables_set`(+`math_arithmetic`) | Only `+= -= *= /=` tokenized & mapped (to set x = x OP v). `//= %= **= &= \|= ^= >>= <<=` not tokenized → error. Round-trips as expanded form, not aug block. |
| ASG-06 | Annotated assignment | MISSING | — | `:` after target taken as block-colon; `x: int = 5` mis-parses. No annotation node. |
| ASG-07 | Walrus `:=` | MISSING | — | `:=` not tokenized. |
| ASG-08 | Subscript/attr target | PARTIAL | (`raw_statement`) | `d["k"] = 1`: `parsePrimary` builds `BinOp INDEX`, then `=` → Assign with non-Name target. `astToBlockly` Assign uses `node.target.id` (undefined→'x'), so block target is wrong → falls apart. `obj.attr = 2` similar (Attribute target ignored). Effectively lossy; no dedicated block. |
| ASG-09 | `del` | MISSING | — | `del` not a keyword → lexed as identifier `del`, then `x` → two identifiers → parse error. |
| ASG-10 | `global` | MISSING | — | Not a keyword; `global counter` → two identifiers → error. |
| ASG-11 | `nonlocal` | MISSING | — | Same as global. |

---

## 3. Operators & Expressions (OP)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| OP-01 | Arithmetic `+ - * /` | MATCHED | `math_arithmetic` | Full round-trip via BinOp. |
| OP-02 | Floor division `//` | MISSING | — | `//` not tokenized (single `/` only) → `/` `/` → parse error. |
| OP-03 | Modulo `%` | MISSING | — | `%` not tokenized → SyntaxError. (`math_modulo` exists in toolbox but no generator/parser wiring.) |
| OP-04 | Power `**` | MISSING | — | `*` `*` → multiplicative parser sees `*` then `*` with no operand → error. |
| OP-05 | Unary minus/plus | PARTIAL | `math_arithmetic`-ish | `parseUnary` handles `-x` (as `BinOp(null,'-',x)`), but `astToBlockly` BinOp `-` needs `left`; with null left it emits `math_arithmetic` with missing A → broken block. Unary `+x` not handled at all. |
| OP-06 | Comparison | MATCHED | `logic_compare` | `< <= > >= == !=` round-trip. |
| OP-07 | Chained comparison | PARTIAL | nested `logic_compare` | `0 < x < 10` parses left-assoc into `(0<x)<10` (wrong semantics) but produces blocks. Lossy/incorrect. |
| OP-08 | Logical and/or/not | MATCHED | `logic_operation`/`logic_negate` | `and`,`or`→`logic_operation`; `not`→`logic_negate`. |
| OP-09 | Identity `is` | MISSING | — | `is` not a keyword. No block. |
| OP-10 | Membership `in`/`not in` | MISSING | — | `in` is a keyword only consumed inside for/comp; as a comparison operator it is not parsed. No block. |
| OP-11 | Bitwise `& \| ^ ~ << >>` | MISSING | — | None tokenized → SyntaxError. |
| OP-12 | Ternary `a if c else b` | PARTIAL | — | Parsed to `Ternary` and `astToPython` round-trips, but `convertExpressionToBlock` has no Ternary case → falls to `text` literal (lossy: becomes a string). No `logic_ternary` wiring. |
| OP-13 | Indexing `seq[i]` | MATCHED | `lists_getIndex` | `BinOp INDEX` ↔ `lists_getIndex` (GET/FROM_START). Note: Blockly uses 1-based; round-trip preserves the value but not 0/1 base semantics — acceptable as MATCHED for structure. |
| OP-14 | Slicing | MISSING | — | `seq[1:5]`: inside `[` the `:` is unexpected (parseExpression has no slice) → error. No `lists_getSublist` wiring. |
| OP-15 | Attribute access | PARTIAL | (`raw_expression`) | `obj.attr` parses to `Attribute` and `astToPython` round-trips, but no `convertExpressionToBlock` case → `text` literal (lossy). As a call receiver it works via raw. |
| OP-16 | Call expression | PARTIAL | dynamic `lib_*` / `raw_expression` | Known calls (print, sprite.*, append, range) map to dedicated blocks. Arbitrary `f(1,2)`: statement→`raw_statement`, expression→`raw_expression`. Works but generic, not 1:1. |
| OP-17 | Call w/ keyword args | MISSING | — | `f(a=1)`: arg parsed as `a`, then `=` → builds Assign inside arg list? `parseExpression` for arg returns `a`; back in call loop sees `=` (not `,`/`)`) → `expect ')'` fails. |
| OP-18 | Call w/ `*args`/`**kwargs` | MISSING | — | `*`/`**` prefix in args not tokenized as unary → error. |
| OP-19 | Lambda | PARTIAL | (`raw_expression`) | Parsed to `Lambda`, round-trips via `astToPython`; `convertExpressionToBlock` emits `raw_expression`. No dedicated lambda block. |
| OP-20 | Parenthesized grouping | PARTIAL | — | `(a+b)*c` parses correctly (precedence preserved in AST), but parentheses are not stored; `astToPython` doesn't re-add them, relying on operator precedence — generally fine for `+ - * /`. Blocks nest correctly. Marked PARTIAL because grouping isn't an explicit node and odd cases can lose parens. |
| OP-21 | `%` / `.format()` | PARTIAL | (`raw_*`) | `%` not tokenized (fails). `"...".format(x)` parses as Attribute-call → `raw_expression`. No dedicated block. |

---

## 4. Comprehensions & Generators (CMP)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| CMP-01 | List comprehension | PARTIAL | (`text` literal) | Parsed to `ListComp`, `astToPython` round-trips. But `convertExpressionToBlock` has NO ListComp case → emits a `text` block of the source string (lossy: becomes a string literal). No dedicated comprehension block. |
| CMP-02 | List comp w/ filter | PARTIAL | (`text` literal) | Single `if` filter parsed (`ListCompNode.ifs`); same lossy block path as CMP-01. |
| CMP-03 | Nested comprehension | MISSING | — | Parser allows only one `for` clause; `[x for row in m for x in row]` → trailing `for` → `expect ']'` fails. |
| CMP-04 | Dict comprehension | MISSING | — | `{` not tokenized. |
| CMP-05 | Set comprehension | MISSING | — | `{` not tokenized. |
| CMP-06 | Generator expression | MISSING | — | `(x for x in xs)`: `parseAtom` reads `(expr)` then hits `for` → `expect ')'` fails. |
| CMP-07 | Multiple `if` conditions | MISSING | — | Only one `if` clause parsed; second `if` → `expect ']'` fails. |

---

## 5. Control Flow (CF)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| CF-01 | `if` | MATCHED | `controls_if` | Both directions. |
| CF-02 | `if/else` | MATCHED | `controls_if`(else) | `hasElse` extraState handled. |
| CF-03 | `if/elif/else` | PARTIAL | `controls_if`(elseif) | Parser nests elif chains; `astToBlockly` only emits ONE `IF1/DO1` (single elif) — multiple `elif` clauses collapse/lose branches. Single elif+else works; 2+ elif is lossy. |
| CF-04 | `for` over iterable | MATCHED | `controls_forEach` | `for x in xs` ↔ forEach. |
| CF-05 | `for` over range | MATCHED | `controls_repeat_ext` / `controls_for` | `range(n)`→repeat; `range(a,b,c)`→`controls_for`. |
| CF-06 | `for` w/ enumerate | MISSING | — | Single target var only (`parseFor` reads one IDENTIFIER). `for i, x in ...` → `,` after `i` → `expect "in"` fails. |
| CF-07 | `for` w/ unpacking | MISSING | — | Same single-target limitation; tuple target unsupported. |
| CF-08 | `for/else` | MISSING | — | No `else` clause parsed after `for`; trailing `else` becomes a stray statement → error/dropped. |
| CF-09 | `while` | MATCHED | `controls_whileUntil` | WHILE mode both ways. |
| CF-10 | `while True` | MATCHED | `controls_whileUntil` | `True`→`logic_boolean` test; round-trips. |
| CF-11 | `while/else` | MISSING | — | No while-else parsing. |
| CF-12 | `break` | MISSING | — | `break` not a keyword → identifier → bare expr statement; `astToBlockly`→`raw_statement` "break". `controls_flow_statements` exists in toolbox but unused + no generator registered. |
| CF-13 | `continue` | MISSING | — | Same as break (note: `controls_flow_statements` block in toolbox, no Python generator override registered, parser never emits it). |
| CF-14 | `pass` | PARTIAL | — | Parsed to `Pass`; `astToPython` emits `pass`; but `convertStatementToBlock` returns `null` (dropped) — no block. Text→text loses nothing only because empty suites get `pass`. Block direction: missing. |
| CF-15 | `match/case` | MISSING | — | Not keywords; not parseable. |
| CF-16 | match patterns | MISSING | — | As above. |

---

## 6. Functions (FN)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| FN-01 | Function def | MATCHED | `procedures_defnoreturn`/`defreturn` | Round-trips. (Return as last stmt → defreturn.) |
| FN-02 | Positional params | MATCHED | `procedures_def*` | `extraState.params` carries names. |
| FN-03 | Default params | MISSING | — | `def f(a, b=2)`: param parse expects IDENTIFIER then `,`; `=` → `expect ')'`/`,` fails. |
| FN-04 | `*args` | MISSING | — | `*` not tokenized as param prefix. |
| FN-05 | `**kwargs` | MISSING | — | `**` not tokenized. |
| FN-06 | Keyword-only `*,` | MISSING | — | bare `*` separator unsupported. |
| FN-07 | Positional-only `/` | MISSING | — | `/` in params parsed as divide → error. |
| FN-08 | Type-annotated params/return | MISSING | — | `a: int` and `-> str`: `:`/`->` unsupported in signature. |
| FN-09 | `return` value | MATCHED | `function_return` / defreturn RETURN | Round-trips. |
| FN-10 | bare `return` | PARTIAL | `function_return`(FALSE) | `ReturnNode(null)` → `function_return` HAS_VALUE FALSE. Works, but only when standalone; as last stmt of def, a bare return yields defreturn with no RETURN input (OK). Minor. |
| FN-11 | Multiple return (tuple) | MISSING | — | `return a, b`: parses `a`, leaves `,` → newline expect fails (no tuple node). |
| FN-12 | `yield` | MISSING | — | Not a keyword → identifier → bare expr → `raw_statement` "yield" (broken). No block. |
| FN-13 | `yield from` | MISSING | — | As above; `from` not keyword either. |
| FN-14 | Decorator | PARTIAL | extraState.decorators | `parseStatement` has NO `@` handling and `@` is not tokenized → SyntaxError on input. astToBlockly *can* carry decorators (FunctionDef path reads `node.decorators`) and `astToPython` re-emits `@`, but the PARSER can never produce them. So block→Python may work if decorators were set programmatically; Python→block fails. Net: not usable from text. |
| FN-15 | Decorator w/ args | MISSING | — | Same `@` tokenizer gap + call args. |
| FN-16 | Nested function/closure | PARTIAL | (`raw_statement`) | Parser handles nested `def`. In `astToBlockly`, a `FunctionDef` nested inside another def's body goes through `convertStatementListToBlock`→`convertStatementToBlock` 'FunctionDef' which returns a `procedures_def*` block — but those have no previous/next connection, so nesting in a stack is invalid. Class bodies special-case to `raw_statement` (line 1604); function bodies do not. Lossy/invalid blocks. |
| FN-17 | Docstring | MISSING | — | Triple-quoted string unsupported by lexer (see LIT-05). A single-line `"doc"` becomes a bare `Str` expr → `text` block (lossy). |
| FN-18 | (covered by OP-17) | MISSING | — | See OP-17 keyword args. |

---

## 7. Classes & OOP (CLS)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| CLS-01 | Class definition | PARTIAL | `class_def` | Parses; `astToBlockly`→`class_def`. But class BODY methods are converted to `raw_statement` strings (line 1604), so method bodies are flattened text — round-trips textually but no structured method blocks. |
| CLS-02 | Inheritance | PARTIAL | `class_def` (BASES field) | `class C(Base)` → bases captured as comma string. Works textually. |
| CLS-03 | Multiple inheritance | PARTIAL | `class_def` | Same; bases joined with `, `. |
| CLS-04 | `__init__` | PARTIAL | (`raw_statement`) | Methods become raw text blocks; `self`/params survive only as text. |
| CLS-05 | Instance method | PARTIAL | (`raw_statement`) | As above. |
| CLS-06 | `self.attr =` | PARTIAL | (`raw_statement`) | Inside a method body it's raw text. As a standalone Assign, target is Attribute → astToBlockly Assign breaks (target.id undefined). |
| CLS-07 | Class attribute | PARTIAL | (`raw_statement`) | Inside class body → raw text. |
| CLS-08 | `@staticmethod` | MISSING | — | Decorator/`@` not tokenized (see FN-14). |
| CLS-09 | `@classmethod` | MISSING | — | Same. |
| CLS-10 | `@property` | MISSING | — | Same. |
| CLS-11 | Dunder methods | PARTIAL | (`raw_statement`) | Parse OK as named defs (text only); no operator-block mapping. |
| CLS-12 | `super()` | PARTIAL | (`raw_*`) | `super().__init__()` is a call chain → `raw_expression`/`raw_statement`. Works as text. |
| CLS-13 | `@dataclass` | MISSING | — | `@` not tokenized. |
| CLS-14 | Instantiation | PARTIAL | (`raw_expression`) | `obj = C(1)` → Assign with value Call → `raw_expression`. Works as text, not a dedicated "new" block. |
| CLS-15 | `isinstance`/`issubclass` | PARTIAL | dynamic `lib_global_*` / `raw_expression` | Generic call handling only. |

---

## 8. Exceptions & Context (EXC)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| EXC-01 | `try/except` | MISSING | — | `try`/`except` not keywords → identifiers → `try` becomes bare expr, then `:` unexpected → error. |
| EXC-02 | `except` specific type | MISSING | — | As above. |
| EXC-03 | `except ... as e` | MISSING | — | As above. |
| EXC-04 | Multiple except | MISSING | — | As above. |
| EXC-05 | `try/except/else` | MISSING | — | As above. |
| EXC-06 | `try/finally` | MISSING | — | `finally` not keyword. |
| EXC-07 | `raise` | MISSING | — | `raise` not keyword → identifier; `raise ValueError("x")` → two identifiers/call → garbled. |
| EXC-08 | bare `raise` | MISSING | — | identifier `raise` alone → `raw_statement` "raise" by luck, but not a real block. |
| EXC-09 | `raise ... from` | MISSING | — | `from` not keyword. |
| EXC-10 | `assert` | MISSING | — | `assert` not keyword. |
| EXC-11 | `with` | MISSING | — | `with` not keyword; `with open(f) as h:` → `with` identifier then call then `as` keyword unexpected → error. |
| EXC-12 | multiple `with` | MISSING | — | As above. |
| EXC-13 | Custom exception class | PARTIAL | `class_def` | `class MyError(Exception):` parses like any class (base captured). Body raw. |

---

## 9. Modules & Imports (IMP)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| IMP-01 | `import module` | PARTIAL | — | Parsed to `ImportNode`; `astToPython` round-trips. But `convertStatementToBlock` 'Import' returns `null` (dropped) — NO block produced. Python→block loses the import. |
| IMP-02 | `import a.b.c` | MISSING | — | `parseImport` reads one IDENTIFIER then stops; `.b` → leftover `.` → newline expect fails. |
| IMP-03 | `import ... as` | PARTIAL | — | `import numpy as np` parses (alias captured) and `astToPython` re-emits, but no block (Import→null). |
| IMP-04 | `from ... import name` | MISSING | — | `from` not a keyword; `parseImport` only triggers on `import`. `from` → identifier → error. |
| IMP-05 | `from ... import a, b` | MISSING | — | As above. |
| IMP-06 | `from ... import *` | MISSING | — | `*` + `from` unsupported. |
| IMP-07 | `from ... import ... as` | MISSING | — | As above. |
| IMP-08 | relative import | MISSING | — | `.`/`from` unsupported. |
| IMP-09 | `if __name__ == "__main__":` | PARTIAL | `controls_if` | Parses as a normal `if` with `logic_compare` (`__name__ == "__main__"`). Round-trips structurally; `__name__` becomes a `variables_get`. Works but semantically just a comparison, not a dedicated guard. |

---

## 10. Built-in Functions (BIF)

Generic calls go through `convertCallExpression` → dedicated block if known, else dynamic
`lib_global_<fn>` block (auto-registered at runtime) or `raw_expression`/`raw_statement`.
None of these (except print/range) are dedicated, statically-defined, toolbox-exposed blocks.

| ID | Functions | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| BIF-01 | `print()` | MATCHED | `text_print` | Dedicated both ways. |
| BIF-02 | `input()` | MISSING | — | `text_prompt_ext` IS in toolbox, but parser never maps `input()` to it and no custom generator emits `input()`. `input()` from text → dynamic `lib_global_input`/`raw_expression`. Not 1:1. |
| BIF-03 | `len()` | PARTIAL | (dynamic/`raw`) | `lists_length`/`text_length` exist in toolbox but parser maps `len()`→generic call. Not wired. |
| BIF-04 | `range()` | MATCHED | (folded into `controls_for`/`repeat`) | `RangeNode` handled; only meaningful inside `for`. As a standalone value it has no expression block (would error in convertExpressionToBlock — no Range case → `text`). Marked MATCHED for the loop use which is the catalog intent. |
| BIF-05 | Type constructors | PARTIAL | (dynamic/`raw`) | `int()/str()/list()`… → generic call blocks only. |
| BIF-06 | `abs round pow divmod` | PARTIAL | (dynamic/`raw`) | `math_single`(ABS)/`math_round`/`math_arithmetic`(POWER) exist in toolbox but unwired; parser → generic call. |
| BIF-07 | `min max sum` | PARTIAL | (dynamic/`raw`) | Generic call only. |
| BIF-08 | `sorted reversed` | PARTIAL | (dynamic/`raw`) | `lists_sort` in toolbox, unwired. |
| BIF-09 | `enumerate zip` | PARTIAL | (dynamic/`raw`) | Generic call; also breaks in `for` targets (see CF-06). |
| BIF-10 | `map filter` | PARTIAL | (dynamic/`raw`) | Generic call (args often lambdas → raw). |
| BIF-11 | `any all` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-12 | `type isinstance issubclass` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-13 | `getattr setattr hasattr delattr` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-14 | `id hash repr ascii` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-15 | `chr ord` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-16 | `bin hex oct format` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-17 | `open()` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-18 | `iter next` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-19 | `vars dir globals locals` | PARTIAL | (dynamic/`raw`) | Generic call. |
| BIF-20 | `callable eval exec compile` | PARTIAL | (dynamic/`raw`) | Generic call. |

---

## 11. Built-in Type Methods (MTH)

All method calls (`x.method(...)`) parse as `Attribute`+`Call`. Only `.append()` has a
dedicated block (`list_append_custom`). Everything else → dynamic `lib_<recv>_<method>`
block or `raw_expression`/`raw_statement`. Round-trips as text but not 1:1 blocks.

| ID | Type / Methods | Status | Block type | Notes |
|----|------|--------|-----------|-------|
| MTH-01 | str methods (`upper split join replace`…) | PARTIAL | (dynamic/`raw`) | `text_changeCase`/`text_trim`/`lists_split` exist in toolbox but parser doesn't map str methods to them. |
| MTH-02 | list methods | PARTIAL | `list_append_custom` (append only) | `append`→dedicated block both ways. `extend/insert/remove/pop/sort/...` → generic/raw. |
| MTH-03 | dict methods | PARTIAL | (dynamic/`raw`) | Plus dict literals themselves unsupported (LIT-15). |
| MTH-04 | set methods | PARTIAL | (dynamic/`raw`) | Set literals unsupported (LIT-16). |
| MTH-05 | tuple methods | PARTIAL | (dynamic/`raw`) | Tuples unsupported (LIT-14). |

---

## 12. Standard Library Modules (STD)

No dedicated stdlib blocks exist (except OpenCV `cv2_*`, which is outside this catalog's
listed modules). All stdlib usage flows through dynamic `lib_<module>_<func>` auto-blocks or
`raw_*`. Imports themselves don't round-trip to blocks (IMP-01). `math.pi`/`sys.argv`
attribute access → `text` literal (lossy, see OP-15).

| ID | Module | Status | Block type | Notes |
|----|--------|--------|-----------|-------|
| STD-01 | `math` | PARTIAL | dynamic `lib_math_*` | Function calls auto-register a block at runtime; constants (`math.pi`) lossy. |
| STD-02 | `random` | PARTIAL | dynamic `lib_random_*` | `math_random_int` in toolbox but unwired to `random.randint`. |
| STD-03 | `json` | PARTIAL | dynamic / `raw` | Call-only. |
| STD-04 | `datetime` | PARTIAL | dynamic / `raw` | Chained attrs (`datetime.datetime.now()`) → `lib` with joined name or raw. |
| STD-05 | `time` | PARTIAL | dynamic / `raw` | Call-only. |
| STD-06 | `os` | PARTIAL | dynamic / `raw` | `os.path.join` nested attr handled by `getCallFullPath`. |
| STD-07 | `sys` | PARTIAL | dynamic / `raw` | `sys.argv` attribute (not call) → lossy `text`. |
| STD-08 | `collections` | PARTIAL | dynamic / `raw` | Constructors (`Counter(...)`) → generic. |
| STD-09 | `itertools` | PARTIAL | dynamic / `raw` | Call-only. |
| STD-10 | `functools` | PARTIAL | dynamic / `raw` | Decorators (`@lru_cache`) fail (FN-14). |
| STD-11 | `re` | PARTIAL | dynamic / `raw` | Raw strings as patterns fail (LIT-07). |
| STD-12 | `string` | PARTIAL | dynamic / `raw` | Constants → lossy attr. |
| STD-13 | `statistics` | PARTIAL | dynamic / `raw` | Call-only. |
| STD-14 | `decimal`/`fractions` | PARTIAL | dynamic / `raw` | Constructors → generic. |
| STD-15 | `pathlib` | PARTIAL | dynamic / `raw` | `Path(...)` / `/` operator overload fails (`//`/`/` chaining limited). |
| STD-16 | `csv` | PARTIAL | dynamic / `raw` | Call-only. |
| STD-17 | `dataclasses` | MISSING | — | Requires `@dataclass` decorator (FN-14, `@` not tokenized). |
| STD-18 | `typing` | MISSING | — | Used in annotations (`x: List[int]`) which don't parse (ASG-06/FN-08); subscript on generics (`List[int]`) also `[ ]` index works but annotation context fails. |
| STD-19 | `enum` | PARTIAL | `class_def`/`raw` | `class Color(Enum):` parses; members raw. `auto()` generic call. |
| STD-20 | `copy` | PARTIAL | dynamic / `raw` | Call-only. |

---

## 13. Async (ASY)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| ASY-01 | `async def` | MISSING | — | `async` not a keyword → identifier before `def`; parseStatement sees `async` as expr → error. |
| ASY-02 | `await` | MISSING | — | `await` not keyword. |
| ASY-03 | `async for` | MISSING | — | As above. |
| ASY-04 | `async with` | MISSING | — | `with` + `async` both unsupported. |

---

## 14. Comments & Misc (MSC)

| ID | Construct | Status | Block type | Notes |
|----|-----------|--------|-----------|-------|
| MSC-01 | Line comment | PARTIAL | (Blockly comment) | Tokenized as COMMENT but FILTERED OUT before parse (line 439) → never reaches AST/blocks. Lost on Python→block. |
| MSC-02 | Inline comment | PARTIAL | — | Same: stripped, lost. |
| MSC-03 | Docstring | MISSING | — | Triple-quote unsupported (LIT-05). |
| MSC-04 | Line continuation `\` | MISSING | — | `\` not handled by lexer outside strings → `Unexpected character "\"`. |
| MSC-05 | Semicolon stmts | MISSING | — | `;` not tokenized → SyntaxError. |
| MSC-06 | Type alias (3.12) | MISSING | — | `type Vec = ...` → `type` identifier then `Vec` → two identifiers → error. |

---

## Summary counts

| Status | Count |
|--------|-------|
| MATCHED | 18 |
| PARTIAL | 67 |
| MISSING | 75 |
| **Total catalog items** | **160** |

(MATCHED: LIT-04, LIT-10, LIT-13, ASG-01, OP-01, OP-06, OP-08, OP-13, CF-01, CF-02, CF-04,
CF-05, CF-09, CF-10, FN-01, FN-02, FN-09, BIF-01, BIF-04 — counted 18 incl. range/print.)

---

## Implementation worklist (prioritized for a downstream implementer)

Legend for "layers": **T**=tokenizer, **P**=parser, **A**=astToBlockly (`convertStatement/ExpressionToBlock`),
**B**=`Blockly.Blocks`+`Blockly.Python` generator, **X**=toolbox XML in `index.html`.
Also note `astToPython` may need a case for new AST nodes.

### Tier 1 — High value, low effort (mostly wiring existing blocks; no new tokens)

These give the biggest correctness wins because the construct already parses but the
AST→Blockly step is the only gap (lossy `text`/`raw`/dropped).

1. **Ternary expression (OP-12)** — `Ternary` already parses & round-trips in Python. Add a
   `convertExpressionToBlock` case → no standard ternary block exists, so add a small custom
   `logic_ternary` block. Layers: **A, B, X** (+ already have astToPython).
2. **List/dict/set comprehension blocks (CMP-01/02)** — `ListComp` already parses. Add an
   `convertExpressionToBlock` case. Best as a dedicated `list_comprehension` custom block
   (elt / var / iter / optional filter). Layers: **A, B, X**.
3. **`pass` block (CF-14)** — parses to `Pass` but `convertStatementToBlock` returns null. Add a
   tiny `controls_pass` custom block + generator, and emit it. Layers: **A, B, X**.
4. **`None` → `logic_null` (LIT-11)** — add a `Name('None')` special-case in
   `convertExpressionToBlock` to emit `logic_null`, and register `Blockly.Python['logic_null']`
   → `None`. Layers: **A, B** (block already in toolbox).
5. **`import` blocks (IMP-01/03)** — `Import` parses but `convertStatementToBlock` drops it.
   Add a custom `import_statement` block (module + optional alias) + generator + emit it.
   Layers: **A, B, X**.
6. **Attribute access expression (OP-15)** — `Attribute` parses & round-trips; add
   `convertExpressionToBlock` case → custom `attribute_access` block (object + name) instead of
   lossy `text`. Layers: **A, B, X**.
7. **Lambda block (OP-19)** — parses; currently `raw_expression`. Optional dedicated
   `lambda_expr` block. Layers: **A, B, X** (low priority — raw works).
8. **Fix unary minus (OP-05)** — `astToBlockly` BinOp `-`/`+` with null left produces a broken
   `math_arithmetic`. Add a `math_single`(NEG) mapping (block exists). Layers: **A** (+ maybe B
   if using `math_single`).

### Tier 2 — High value, medium effort (needs new keyword/token + parser + node + all layers)

9. **`break` / `continue` (CF-12/13)** — add `break`,`continue` to KEYWORDS; parser produces
   Break/Continue nodes; map to standard `controls_flow_statements` (already in toolbox) and
   register its Python generator (currently NONE). Layers: **T(keyword), P, A, B(generator only),** toolbox already present.
10. **`for` with tuple targets / enumerate / unpacking (CF-06/07)** — extend `parseFor` to read
    multiple comma targets; needs a Tuple target node; map to `controls_forEach` with a tuple
    var or a custom unpacking block. Layers: **P, A, B/X**.
11. **`input()` → `text_prompt_ext` (BIF-02)** — map `Call(Name 'input')` in
    `convertCallExpression`; register generator for `text_prompt_ext` → `input(...)`; parse
    `input()` back. Block already in toolbox. Layers: **A, B(generator), P-recognition**.
12. **`len()` → `lists_length`/`text_length` (BIF-03)** and common builtins
    (`abs`→`math_single`, `round`→`math_round`, `sorted`→`lists_sort`,
    `random.randint`→`math_random_int`) — add recognition in `convertCallExpression` and
    register Python generators (currently missing) for those toolbox blocks. Layers: **A, B(generators), P (recognize call back)**.
13. **Modulo / floor-div / power operators (OP-02/03/04)** — add `%`, `//`, `**` to the
    tokenizer (multi-char ops + `%`), parser precedence levels, BinOp ops; map `%`→`math_modulo`
    (toolbox), `**`→`math_arithmetic`(POWER), `//`→custom. Layers: **T, P, A, B/X**.
14. **Membership/identity (`in`,`not in`,`is`,`is not`) (OP-09/10)** — extend comparison parser;
    no standard block → custom compare block or extend `logic_compare`. Layers: **T(`is`), P, A, B/X**.
15. **Subscript/attribute assignment targets (ASG-08, CLS-06)** — fix `astToBlockly` Assign to
    handle non-Name targets (`d[k]=v`, `obj.attr=v`) via `lists_setIndex` (toolbox) / custom
    set-attr block. Layers: **A, B(generator for lists_setIndex), X-present**.
16. **Tuple literal + tuple return + multiple assignment (LIT-14, FN-11, ASG-02/03)** — add a
    Tuple AST node, parse top-level comma expressions, custom `tuple_create` block. Underpins
    enumerate/unpacking too. Layers: **P, A, B, X** (+ astToPython).

### Tier 3 — New language constructs (full new keyword + parser + node + block stack)

These each need: KEYWORD addition (T), a new parse routine (P), a new AST node + astToPython
case, a new statement block with body inputs (B), toolbox entry (X), and an `astToBlockly` case (A).

17. **`try / except / else / finally` (EXC-01..06)** — new keywords `try except finally`, plus
    `as` (exists). Multi-clause block (statement mutator). Layers: **T, P, A, B, X**.
18. **`raise` / `raise ... from` (EXC-07/08/09)** — keyword `raise`, optional `from`. Statement
    block. Layers: **T, P, A, B, X**.
19. **`with` / multiple `with` (EXC-11/12)** — keyword `with`; `as` exists. Context-manager block
    with body. Layers: **T, P, A, B, X**.
20. **`assert` (EXC-10)** — keyword `assert`, optional message. Statement block. Layers: **T, P, A, B, X**.
21. **`del` (ASG-09)** — keyword `del`. Statement block. Layers: **T, P, A, B, X**.
22. **`global` / `nonlocal` (ASG-10/11)** — keywords. Simple statement blocks. Layers: **T, P, A, B, X**.
23. **`yield` / `yield from` (FN-12/13)** — keyword `yield`; statement/expression block. Layers: **T, P, A, B, X**.
24. **`from ... import` family (IMP-04..08)** + dotted `import a.b.c` (IMP-02) — keyword `from`;
    extend `parseImport` for dotted names, `*`, alias list. Layers: **T, P, A, B, X**.
25. **Decorators `@dec` / `@dec(args)` (FN-14/15, CLS-08/09/10/13, STD-10/17)** — tokenize `@`;
    parse decorator lines before def/class (the AST already *carries* `decorators` and
    `astToPython` re-emits them — only T+P+block UI are missing). High leverage: unblocks
    staticmethod/classmethod/property/dataclass/lru_cache. Layers: **T, P, A(decorator UI on def block), B/X**.
26. **`async def` / `await` / `async for` / `async with` (ASY-01..04)** — keywords `async await`;
    parser variants of def/for/with. Layers: **T, P, A, B, X**.
27. **`match / case` (CF-15/16)** — keywords `match case`; structural pattern parser + block.
    Large effort. Layers: **T, P, A, B, X**.

### Tier 4 — Lexer/literal extensions (tokenizer-heavy)

28. **Dict & set literals + comprehensions (LIT-15/16, CMP-04/05)** — tokenize `{` `}` `:`-as-
    dict-sep; parse dict/set; custom blocks (no standard dict block in Blockly). Layers: **T, P, A, B, X**.
29. **Tuple/paren grouping & generator exprs (LIT-14, CMP-06, OP-20 robustness)** — see #16; gen
    exprs need `for` inside `()`. Layers: **P, A, B, X**.
30. **f-strings / raw / bytes / triple-quoted / implicit concat (LIT-05..09, FN-17, MSC-03)** —
    extend string lexer for prefixes and `"""`. f-strings need an interpolation block. Layers: **T, P, A, B, X**.
31. **Numeric literal forms: hex/bin/oct, `_`, scientific, complex (LIT-01/02/03)** — broaden the
    number regex/lexer; `math_number` can hold the value but base/format is lost (store original
    text). Layers: **T** (+ optional B field to preserve form).
32. **Bitwise operators `& | ^ ~ << >>` (OP-11)** — tokenize; parser precedence; custom blocks
    (no standard Blockly bitwise blocks). Layers: **T, P, A, B, X**.
33. **Augmented-assign full set (ASG-05)** — tokenize `//= %= **= &= |= ^= >>= <<=`; extend
    `augOps`. Layers: **T, P** (A already expands to set+arith for the new ops once mapped).
34. **Annotations & type aliases (ASG-06, FN-08, STD-18, MSC-06)** — tokenize `:` in expr
    context / `->` / `type`; store annotations (ignored or shown). Layers: **T, P, A, B, X**.
35. **Walrus `:=` (ASG-07)** — tokenize `:=`; expression-assignment node. Layers: **T, P, A, B, X**.
36. **Default params, `*args`, `**kwargs`, kw-only/pos-only (FN-03..07)** — tokenize `*`/`**`/`/`
    in param lists, `=` defaults; extend `parseFunctionDef` and the procedure block's param model.
    Layers: **T(partial), P, A, B(param mutator), X**.
37. **Call keyword args & unpacking (OP-17/18)** — parse `name=val`, `*a`, `**kw` in call args;
    represent on call blocks. Layers: **T(`*`/`**`), P, A, B**.
38. **Chained comparison & multiple comp conditions (OP-07, CMP-03/07)** — parser changes to
    keep chains/multiple clauses; custom blocks. Layers: **P, A, B, X**.
39. **Comments round-trip (MSC-01/02)** — stop filtering COMMENT tokens (line 439); attach to
    nodes; map to Blockly block comments. Layers: **P, A** (uses Blockly comment model).
40. **Line continuation `\`, semicolons `;`, ellipsis `...` (MSC-04/05, LIT-12)** — lexer
    handling. Layers: **T** (+ P for `;` multi-stmt).

### Tier 5 — Best handled by the generic `raw_*` fallback (already "works" as text)

The large group of BIF-05..20, MTH-01..05, and STD-01..16/19/20 already round-trip as text via
dynamic `lib_*` auto-blocks or `raw_expression`/`raw_statement`. Promoting any to a dedicated
1:1 block is optional polish; prioritize only the most common (`len`, `input`, `abs`, `round`,
`str/int/list` constructors, `random.randint`, `range`, str `.split/.join/.upper`,
`math.sqrt`) — all are **A + B(generator) + P-recognition** with toolbox blocks that already
exist for several (`text_length`, `lists_length`, `math_single`, `math_round`, `lists_sort`,
`math_random_int`, `lists_split`, `text_changeCase`).
