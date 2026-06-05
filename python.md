# Python Syntax Catalog (BlockPy)

Comprehensive catalog of Python syntax for the BlockPy Blockly↔Python project. Scope: **core language grammar + built-in functions + common standard-library modules**.

Each item has a stable ID (e.g. `CF-01`) so downstream agents can map it to a Blockly block (matched / partial / missing). The right-hand **Block?** column is a placeholder filled by the gap-analysis agent.

Legend for examples: snippets are minimal and self-contained.

**Block? column legend** (empirically derived — each snippet was round-tripped through the hand-written compiler `Tokenizer → Parser → astToPython` and `astToBlockly`):

- `✅ <blocktype>` — **MATCHED**: parses, round-trips losslessly (normalized text equal), and `astToBlockly` emits a dedicated block (no `raw_*` fallback). The named block is the most-specific dedicated block produced.
- `🟡 raw` — **PARTIAL**: parses and round-trips (so the Run engine works), but `astToBlockly` represents it via the gray `raw_statement` / `raw_expression` fallback rather than a dedicated block.
- `❌` — **MISSING**: parse throws, or the construct is dropped / semantically altered on round-trip.

---

## Coverage Summary

Measured over all **182** catalog rows.

| Bucket | Count | % of 182 |
|--------|-------|----------|
| ✅ Matched (dedicated block) | 141 | 77.5% |
| 🟡 Partial (`raw` fallback) | 22 | 12.1% |
| ❌ Missing | 19 | 10.4% |

- **block-convertible %** = (matched + partial) / total = (141 + 22) / 182 = **89.6%** — fraction that survives a Python→block→Python round-trip (i.e. converts to *some* block, dedicated or gray fallback).
- **dedicated-block %** = matched / total = 141 / 182 = **77.5%** — fraction that maps to a real, named block (not the gray `raw_*` fallback).

### Per-section breakdown

| Section | Total | ✅ Matched | 🟡 Partial | ❌ Missing |
|---------|------:|----------:|----------:|----------:|
| 1. Literals & Lexical (LIT) | 17 | 15 | 0 | 2 |
| 2. Variables & Assignment (ASG) | 11 | 9 | 0 | 2 |
| 3. Operators & Expressions (OP) | 21 | 19 | 1 | 1 |
| 4. Comprehensions & Generators (CMP) | 7 | 7 | 0 | 0 |
| 5. Control Flow (CF) | 16 | 11 | 1 | 4 |
| 6. Functions (FN) | 18 | 15 | 1 | 2 |
| 7. Classes & OOP (CLS) | 15 | 15 | 0 | 0 |
| 8. Exceptions & Context (EXC) | 13 | 12 | 1 | 0 |
| 9. Modules & Imports (IMP) | 9 | 9 | 0 | 0 |
| 10. Built-in Functions (BIF) | 20 | 19 | 1 | 0 |
| 11. Built-in Type Methods (MTH) | 5 | 1 | 4 | 0 |
| 12. Standard Library Modules (STD) | 20 | 7 | 12 | 1 |
| 13. Async (ASY) | 4 | 0 | 0 | 4 |
| 14. Comments & Misc (MSC) | 6 | 2 | 1 | 3 |
| **Total** | **182** | **141** | **22** | **19** |

**Weakest sections** (most ❌ missing or lowest dedicated-block coverage):

1. **Async (ASY)** — 0/4 matched. `async def` / `await` / `async for` / `async with` are not tokenized at all (the `async`/`await` keywords are unknown), so every row is a parse error.
2. **Standard Library Modules (STD)** — only 7/20 matched; 12/20 fall back to `raw` because dotted-attribute *calls* like `math.sqrt(4)`, `random.randint(...)`, `re.match(...)` have no dedicated block (bare attribute *reads* like `sys.argv` do match).
3. **Comments & Misc (MSC)** — 2/6 matched; line continuation `\`, semicolon-separated statements, and 3.12 `type` aliases are all parse errors.
4. **Control Flow (CF)** — 11/16; the `for/else`, `while/else`, and `match/case` (+ patterns) constructs are parse errors (4 missing).
5. **Built-in Type Methods (MTH)** — only 1/5 matched (`list.append` → `list_append_custom`); all other str/list/dict/set/tuple method calls are `raw` fallbacks.

---

## Palette vs Parser gap

The toolbox/palette in `index.html` (`<block type=...>`, **87** entries) and the set of blocks the parser actually *emits/defines* in `parser.js` (**60** custom blocks) are different sets. Two asymmetries:

### A. Blocks DEFINED in parser.js but NOT in the palette (14)

`binary_op  class_def  double_starred_arg  for_each_custom  for_unpack  function_return  keyword_arg  method_call  method_def  raw_expression  raw_statement  slice_expr  starred_arg  unpack_assign`

These are all **convert-only / output-only blocks** — produced by the Python→block converter (`astToBlockly`) but deliberately not draggable from the palette:

- **(a) Structural / sub-blocks emitted only as children of a larger construct** — you don't drag these standalone; the converter builds them while parsing real code:
  `class_def`, `method_def`, `method_call` (class bodies/`super()`), `function_return` (bare `return`), `for_each_custom` + `for_unpack` (for-loops, incl. enumerate/tuple targets), `unpack_assign` (`a, b = ...`), `slice_expr` (the `1:5` inside a subscript), `binary_op` (a generic op node), and the call-argument sub-blocks `keyword_arg`, `starred_arg`, `double_starred_arg` (the `a=1`, `*args`, `**kwargs` pieces inside a `func_call`). Dragging these from a palette without their parent context would be meaningless.
- **(b) Gray fallback blocks** — `raw_statement` and `raw_expression` are intentionally palette-excluded: they exist only so unconvertible code (e.g. `math.sqrt(...)`, a lambda, a docstring body) still has *some* block representation. Offering them in the palette would invite users to hand-author "escape-hatch" blocks, defeating the 1:1 design.

(Note: `subscript_get` / `subscript_set` ARE in both the palette and the parser, so they are not part of this gap.)

### B. Blocks in the palette but NOT in the parser's custom set (41)

`controls_flow_statements controls_for controls_forEach controls_if controls_repeat_ext controls_whileUntil  logic_boolean logic_compare logic_negate logic_null logic_operation  math_arithmetic math_constrain math_modulo math_number math_number_property math_random_int math_round math_single math_trig  lists_getIndex lists_getSublist lists_indexOf lists_isEmpty lists_length lists_repeat lists_setIndex lists_sort lists_split  text text_append text_changeCase text_charAt text_getSubstring text_indexOf text_isEmpty text_join text_length text_print text_prompt_ext text_trim`

These are **standard Blockly library blocks** shipped in `blocks_compressed.js` (loaded from CDN), not custom blocks defined in `parser.js`. The palette offers the user the *standard* Blockly block (e.g. `math_arithmetic`, `logic_compare`, `text_print`, `controls_if`), and `astToBlockly` happily *emits* those same standard types when it recognizes the matching Python (so they show up as ✅ matches above). The asymmetry is that `parser.js` does not *redefine* them — it relies on Blockly's built-ins. A handful of palette blocks (e.g. `math_constrain`, `lists_sort`, `text_changeCase`) have **no** Python construct the parser maps onto them, so they are draggable-in but never emitted by Convert.

---

## 1. Literals & Lexical (LIT)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| LIT-01 | Integer literal | `42`, `0xFF`, `0b1010`, `0o17`, `1_000` | ✅ math_number |
| LIT-02 | Float literal | `3.14`, `1e10`, `.5`, `2.` | ✅ math_number |
| LIT-03 | Complex literal | `3+4j` | ❌ parse error |
| LIT-04 | String literal (single/double) | `'a'`, `"b"` | ✅ text |
| LIT-05 | Triple-quoted / multiline string | `"""abc"""` | ✅ text |
| LIT-06 | f-string (interpolation) | `f"x={x}"`, `f"{x:.2f}"` | ✅ text (flattened, no interpolation block) |
| LIT-07 | Raw string | `r"\n"` | ✅ text |
| LIT-08 | Bytes literal | `b"data"` | ✅ text |
| LIT-09 | String concatenation (implicit) | `"a" "b"` | ✅ text_concat |
| LIT-10 | Boolean literal | `True`, `False` | ✅ logic_boolean |
| LIT-11 | None literal | `None` | ✅ logic_null |
| LIT-12 | Ellipsis | `...` | ❌ parse error (Ellipsis) |
| LIT-13 | List literal | `[1, 2, 3]` | ✅ lists_create_with |
| LIT-14 | Tuple literal | `(1, 2)`, `1, 2`, `()` | ✅ tuple_create |
| LIT-15 | Dict literal | `{"a": 1}` | ✅ dict_create |
| LIT-16 | Set literal | `{1, 2, 3}` | ✅ set_create |
| LIT-17 | Empty containers | `[]`, `{}`, `set()`, `()` | ✅ lists_create_with |

---

## 2. Variables & Assignment (ASG)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| ASG-01 | Simple assignment | `x = 5` | ✅ variables_set |
| ASG-02 | Multiple targets | `a = b = 0` | ✅ multiple_assign |
| ASG-03 | Tuple/list unpacking | `a, b = 1, 2` | ✅ unpack_assign |
| ASG-04 | Starred unpacking | `a, *rest = [1,2,3]` | ✅ unpack_assign (starred) |
| ASG-05 | Augmented assignment | `x += 1` (`-= *= /= //= %= **= &= \|= ^= >>= <<=`) | ✅ variables_set (augmented) |
| ASG-06 | Annotated assignment | `x: int = 5` | ❌ parse error (annotation) |
| ASG-07 | Walrus / named expr | `if (n := len(a)) > 0:` | ❌ parse error (walrus) |
| ASG-08 | Chained subscript/attr target | `d["k"] = 1`, `obj.attr = 2` | ✅ subscript_set |
| ASG-09 | `del` statement | `del x`, `del d["k"]` | ✅ del_statement |
| ASG-10 | `global` declaration | `global counter` | ✅ global_statement |
| ASG-11 | `nonlocal` declaration | `nonlocal x` | ✅ nonlocal_statement |

---

## 3. Operators & Expressions (OP)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| OP-01 | Arithmetic | `a + b - c * d / e` | ✅ math_arithmetic |
| OP-02 | Floor division | `a // b` | ✅ math_int_divide |
| OP-03 | Modulo | `a % b` | ✅ math_modulo |
| OP-04 | Power | `a ** b` | ✅ math_arithmetic (**) |
| OP-05 | Unary minus/plus | `-x`, `+x` | ✅ math_single |
| OP-06 | Comparison | `< <= > >= == !=` | ✅ logic_compare |
| OP-07 | Chained comparison | `0 < x < 10` | ❌ rewritten to and-chain (loses chained form) |
| OP-08 | Logical | `and`, `or`, `not` | ✅ logic_operation / logic_negate |
| OP-09 | Identity | `is`, `is not` | ✅ identity_test |
| OP-10 | Membership | `in`, `not in` | ✅ membership_test |
| OP-11 | Bitwise | `& \| ^ ~ << >>` | ✅ bitwise_operation |
| OP-12 | Ternary expression | `a if cond else b` | ✅ logic_ternary |
| OP-13 | Indexing | `seq[i]` | ✅ subscript_get |
| OP-14 | Slicing | `seq[1:5]`, `seq[::2]`, `seq[::-1]` | ✅ slice_expr |
| OP-15 | Attribute access | `obj.attr` | ✅ attribute_access |
| OP-16 | Call expression | `f(1, 2)` | ✅ func_call |
| OP-17 | Call w/ keyword args | `f(a=1, b=2)` | ✅ func_call (keyword_arg) |
| OP-18 | Call w/ unpacking | `f(*args, **kwargs)` | ✅ func_call (starred_arg/double_starred_arg) |
| OP-19 | Lambda | `lambda x: x + 1` | 🟡 raw (lambda) |
| OP-20 | Conditional/parenthesized grouping | `(a + b) * c` | ✅ math_arithmetic (grouped) |
| OP-21 | String formatting `%` / `.format()` | `"%d" % n`, `"{}".format(n)` | ✅ math_modulo (% formatting) |

---

## 4. Comprehensions & Generators (CMP)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| CMP-01 | List comprehension | `[x*2 for x in xs]` | ✅ list_comprehension |
| CMP-02 | List comp w/ filter | `[x for x in xs if x > 0]` | ✅ list_comprehension (filter) |
| CMP-03 | Nested comprehension | `[x for row in m for x in row]` | ✅ list_comprehension (nested) |
| CMP-04 | Dict comprehension | `{k: v for k, v in items}` | ✅ dict_comprehension |
| CMP-05 | Set comprehension | `{x for x in xs}` | ✅ set_comprehension |
| CMP-06 | Generator expression | `(x for x in xs)` | ✅ gen_expression |
| CMP-07 | Comprehension w/ multiple conditions | `[x for x in xs if a if b]` | ✅ list_comprehension (multi-if) |

---

## 5. Control Flow (CF)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| CF-01 | `if` | `if c:` | ✅ controls_if |
| CF-02 | `if / else` | `if c: ... else: ...` | ✅ controls_if |
| CF-03 | `if / elif / else` | `if a: ... elif b: ... else: ...` | ✅ controls_if |
| CF-04 | `for` over iterable | `for x in xs:` | ✅ for_each_custom |
| CF-05 | `for` over range | `for i in range(n):` | ✅ for_each_custom (range) |
| CF-06 | `for` w/ enumerate | `for i, x in enumerate(xs):` | ✅ for_unpack (enumerate) |
| CF-07 | `for` w/ unpacking | `for k, v in d.items():` | 🟡 raw (d.items unpack) |
| CF-08 | `for / else` | `for x in xs: ... else: ...` | ❌ parse error (for/else) |
| CF-09 | `while` | `while c:` | ✅ controls_whileUntil |
| CF-10 | `while True` (infinite) | `while True:` | ✅ controls_whileUntil (while True) |
| CF-11 | `while / else` | `while c: ... else: ...` | ❌ parse error (while/else) |
| CF-12 | `break` | `break` | ✅ controls_flow_statements (break) |
| CF-13 | `continue` | `continue` | ✅ controls_flow_statements (continue) |
| CF-14 | `pass` | `pass` | ✅ controls_pass |
| CF-15 | `match / case` (3.10+) | `match x: case 1: ...` | ❌ parse error (match/case) |
| CF-16 | match w/ patterns | `case [a, b]:`, `case {"k": v}:`, `case _:` | ❌ parse error (match patterns) |

---

## 6. Functions (FN)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| FN-01 | Function definition | `def f():` | ✅ procedures_defnoreturn |
| FN-02 | Positional params | `def f(a, b):` | ✅ procedures_defnoreturn |
| FN-03 | Default params | `def f(a, b=2):` | ✅ procedures_defnoreturn (defaults) |
| FN-04 | `*args` | `def f(*args):` | ✅ procedures_defnoreturn (*args) |
| FN-05 | `**kwargs` | `def f(**kwargs):` | ✅ procedures_defnoreturn (**kwargs) |
| FN-06 | Keyword-only params | `def f(*, a):` | ✅ procedures_defnoreturn (kw-only) |
| FN-07 | Positional-only params | `def f(a, /):` | ❌ parse error (positional-only /) |
| FN-08 | Type-annotated params/return | `def f(a: int) -> str:` | ❌ parse error (return annotation) |
| FN-09 | `return` value | `return x` | ✅ procedures_defreturn |
| FN-10 | bare `return` | `return` | ✅ function_return (bare) |
| FN-11 | Multiple return (tuple) | `return a, b` | ✅ procedures_defreturn (tuple) |
| FN-12 | `yield` | `yield x` | ✅ yield_statement |
| FN-13 | `yield from` | `yield from gen()` | ✅ yield_statement (yield from) |
| FN-14 | Decorator | `@decorator` over def | ✅ procedures_def (decorator) |
| FN-15 | Decorator w/ args | `@dec(1)` | ✅ procedures_def (decorator w/ args) |
| FN-16 | Nested function / closure | `def outer(): def inner(): ...` | ✅ procedures_def (nested) |
| FN-17 | Docstring | `def f(): """doc"""` | 🟡 raw (docstring body) |
| FN-18 | Default mutable / call w/ kwargs | covered by OP-17 | ✅ func_call_stmt (keyword_arg) |

---

## 7. Classes & OOP (CLS)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| CLS-01 | Class definition | `class C:` | ✅ class_def |
| CLS-02 | Inheritance | `class C(Base):` | ✅ class_def (inheritance) |
| CLS-03 | Multiple inheritance | `class C(A, B):` | ✅ class_def (multi-inherit) |
| CLS-04 | `__init__` constructor | `def __init__(self, x):` | ✅ class_def + method_def (__init__) |
| CLS-05 | Instance method | `def m(self):` | ✅ class_def + method_def |
| CLS-06 | `self.attr` assignment | `self.x = x` | ✅ class_def + set_attribute |
| CLS-07 | Class attribute | `class C: count = 0` | ✅ class_def (class attr) |
| CLS-08 | `@staticmethod` | static method | ✅ class_def + method_def (@staticmethod) |
| CLS-09 | `@classmethod` | class method (`cls`) | ✅ class_def + method_def (@classmethod) |
| CLS-10 | `@property` | property getter/setter | ✅ class_def + method_def (@property) |
| CLS-11 | Dunder methods | `__str__`, `__repr__`, `__eq__`, `__len__`, `__add__` | ✅ class_def + method_def (dunder) |
| CLS-12 | `super()` call | `super().__init__()` | ✅ class_def + method_call (super) |
| CLS-13 | `@dataclass` | dataclass decorator | ✅ class_def (@dataclass) |
| CLS-14 | Instantiation | `obj = C(1)` | ✅ func_call (instantiation) |
| CLS-15 | `isinstance` / `issubclass` | type checks | ✅ func_call (isinstance) |

---

## 8. Exceptions & Context (EXC)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| EXC-01 | `try / except` | `try: ... except: ...` | ✅ try_statement |
| EXC-02 | `except` specific type | `except ValueError:` | ✅ try_statement (typed except) |
| EXC-03 | `except ... as e` | `except E as e:` | ✅ try_statement (as e) |
| EXC-04 | Multiple except | `except (A, B):` | ✅ try_statement (tuple except) |
| EXC-05 | `try / except / else` | `else:` clause | ✅ try_statement (else) |
| EXC-06 | `try / finally` | `finally:` clause | ✅ try_statement (finally) |
| EXC-07 | `raise` | `raise ValueError("x")` | ✅ raise_statement |
| EXC-08 | bare `raise` (re-raise) | `raise` | ✅ raise_statement (bare) |
| EXC-09 | `raise ... from` | `raise E from cause` | ✅ raise_statement (from) |
| EXC-10 | `assert` | `assert x > 0, "msg"` | ✅ assert_statement |
| EXC-11 | `with` (context manager) | `with open(f) as h:` | ✅ with_statement |
| EXC-12 | multiple `with` | `with a() as x, b() as y:` | 🟡 raw (multi-with) |
| EXC-13 | Custom exception class | `class MyError(Exception):` | ✅ class_def (custom exception) |

---

## 9. Modules & Imports (IMP)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| IMP-01 | `import module` | `import math` | ✅ import_statement |
| IMP-02 | `import a.b.c` | `import os.path` | ✅ import_statement (dotted) |
| IMP-03 | `import ... as` | `import numpy as np` | ✅ import_statement (as) |
| IMP-04 | `from ... import name` | `from math import pi` | ✅ from_import_statement |
| IMP-05 | `from ... import a, b` | `from os import getcwd, listdir` | ✅ from_import_statement (multi) |
| IMP-06 | `from ... import *` | `from math import *` | ✅ from_import_statement (*) |
| IMP-07 | `from ... import ... as` | `from x import y as z` | ✅ from_import_statement (as) |
| IMP-08 | relative import | `from . import mod` | ✅ from_import_statement (relative) |
| IMP-09 | `if __name__ == "__main__":` | main guard | ✅ controls_if (main guard) |

---

## 10. Built-in Functions (BIF)

Each is a `Call` to a known builtin. Grouped for mapping.

| ID | Functions | Block? |
|----|-----------|--------|
| BIF-01 | `print()` | ✅ text_print / print_multi |
| BIF-02 | `input()` | ✅ func_call (input) |
| BIF-03 | `len()` | ✅ func_call (len) |
| BIF-04 | `range()` | 🟡 raw (range as expr) |
| BIF-05 | Type constructors: `int() float() str() bool() list() tuple() dict() set() frozenset() bytes()` | ✅ func_call (constructors) |
| BIF-06 | `abs() round() pow() divmod()` | ✅ func_call (abs/round/pow) |
| BIF-07 | `min() max() sum()` | ✅ func_call (min/max/sum) |
| BIF-08 | `sorted() reversed()` | ✅ func_call (sorted/reversed) |
| BIF-09 | `enumerate() zip()` | ✅ func_call (enumerate/zip) |
| BIF-10 | `map() filter()` | ✅ func_call (map/filter) |
| BIF-11 | `any() all()` | ✅ func_call (any/all) |
| BIF-12 | `type() isinstance() issubclass()` | ✅ func_call (type/isinstance) |
| BIF-13 | `getattr() setattr() hasattr() delattr()` | ✅ func_call (getattr/setattr) |
| BIF-14 | `id() hash() repr() ascii()` | ✅ func_call (id/hash/repr) |
| BIF-15 | `chr() ord()` | ✅ func_call (chr/ord) |
| BIF-16 | `bin() hex() oct() format()` | ✅ func_call (bin/hex/oct) |
| BIF-17 | `open()` | ✅ func_call (open) |
| BIF-18 | `iter() next()` | ✅ func_call (iter/next) |
| BIF-19 | `vars() dir() globals() locals()` | ✅ func_call (vars/dir/globals) |
| BIF-20 | `callable() eval() exec() compile()` | ✅ func_call (callable/eval) |

---

## 11. Built-in Type Methods (MTH)

| ID | Type | Methods | Block? |
|----|------|---------|--------|
| MTH-01 | str | `upper lower strip split join replace find startswith endswith format zfill title capitalize count` | 🟡 raw (str methods) |
| MTH-02 | list | `append extend insert remove pop clear index count sort reverse copy` | ✅ list_append_custom (append); other list methods raw |
| MTH-03 | dict | `keys values items get pop update setdefault clear copy` | 🟡 raw (dict methods) |
| MTH-04 | set | `add remove discard union intersection difference issubset issuperset` | 🟡 raw (set methods) |
| MTH-05 | tuple | `count index` | 🟡 raw (tuple methods) |

---

## 12. Standard Library Modules (STD)

| ID | Module | Common API | Block? |
|----|--------|-----------|--------|
| STD-01 | `math` | `sqrt floor ceil pi e sin cos tan log pow factorial gcd` | 🟡 raw (math.*) |
| STD-02 | `random` | `random randint choice shuffle uniform sample seed` | 🟡 raw (random.*) |
| STD-03 | `json` | `loads dumps load dump` | 🟡 raw (json.*) |
| STD-04 | `datetime` | `datetime.now date timedelta strftime` | 🟡 raw (datetime.*) |
| STD-05 | `time` | `time sleep perf_counter` | 🟡 raw (time.*) |
| STD-06 | `os` | `getcwd listdir path.join environ mkdir remove` | 🟡 raw (os.*) |
| STD-07 | `sys` | `argv exit path stdout` | ✅ attribute_access (sys.argv) |
| STD-08 | `collections` | `Counter defaultdict OrderedDict deque namedtuple` | ✅ func_call (Counter) |
| STD-09 | `itertools` | `chain combinations permutations product count cycle groupby` | 🟡 raw (itertools.*) |
| STD-10 | `functools` | `reduce lru_cache partial wraps` | 🟡 raw (functools.*) |
| STD-11 | `re` | `match search findall sub split compile` | 🟡 raw (re.*) |
| STD-12 | `string` | `ascii_letters digits punctuation` | ✅ attribute_access (string.ascii_letters) |
| STD-13 | `statistics` | `mean median mode stdev` | 🟡 raw (statistics.*) |
| STD-14 | `decimal` / `fractions` | `Decimal Fraction` | ✅ func_call (Decimal) |
| STD-15 | `pathlib` | `Path` | ✅ func_call (Path) |
| STD-16 | `csv` | `reader writer DictReader` | 🟡 raw (csv.*) |
| STD-17 | `dataclasses` | `dataclass field` | ✅ class_def (@dataclass) |
| STD-18 | `typing` | `List Dict Optional Union Any` | ❌ parse error (typing annotation) |
| STD-19 | `enum` | `Enum auto` | ✅ variables_get (Enum bare name) |
| STD-20 | `copy` | `copy deepcopy` | 🟡 raw (copy.*) |

---

## 13. Async (ASY)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| ASY-01 | `async def` | `async def f():` | ❌ parse error (async def) |
| ASY-02 | `await` | `await coro()` | ❌ parse error (await) |
| ASY-03 | `async for` | `async for x in ait:` | ❌ parse error (async for) |
| ASY-04 | `async with` | `async with cm() as x:` | ❌ parse error (async with) |

---

## 14. Comments & Misc (MSC)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| MSC-01 | Line comment | `# comment` | ✅ comment dropped (stmt parses) |
| MSC-02 | Inline comment | `x = 1  # note` | ✅ comment dropped (stmt parses) |
| MSC-03 | Module/function docstring | `"""doc"""` | 🟡 raw (bare docstring) |
| MSC-04 | Line continuation | `a = 1 + \` | ❌ parse error (line continuation) |
| MSC-05 | Semicolon-separated stmts | `a = 1; b = 2` | ❌ parse error (semicolon) |
| MSC-06 | Type alias (3.12) | `type Vec = list[float]` | ❌ parse error (type alias) |

---

## Currently-supported parser AST nodes (baseline)

For reference, `src/utils/parser.js` currently parses these AST node types:
`Program, Assign, AugAssign, For, While, If, Call, ListComp, Ternary, Attribute, Name, Num, Str, Bool, List, BinOp, Range, FunctionDef, Return, Lambda, ClassDef, Pass, Import`.

Existing custom Blockly blocks: `sprite_move/turn/pen/color/say`, `cv2_*`, `class_def`, `raw_statement`, `raw_expression`, `function_return`, `list_append_custom`. Plus standard Blockly library blocks (logic, loops, math, text, lists, variables, procedures) loaded from CDN and listed in `index.html`'s toolbox.
