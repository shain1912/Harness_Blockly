# Python Syntax Catalog (BlockPy)

Comprehensive catalog of Python syntax for the BlockPy Blockly↔Python project. Scope: **core language grammar + built-in functions + common standard-library modules**.

Each item has a stable ID (e.g. `CF-01`) so downstream agents can map it to a Blockly block (matched / partial / missing). The right-hand **Block?** column is a placeholder filled by the gap-analysis agent.

Legend for examples: snippets are minimal and self-contained.

---

## 1. Literals & Lexical (LIT)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| LIT-01 | Integer literal | `42`, `0xFF`, `0b1010`, `0o17`, `1_000` | |
| LIT-02 | Float literal | `3.14`, `1e10`, `.5`, `2.` | |
| LIT-03 | Complex literal | `3+4j` | |
| LIT-04 | String literal (single/double) | `'a'`, `"b"` | |
| LIT-05 | Triple-quoted / multiline string | `"""abc"""` | |
| LIT-06 | f-string (interpolation) | `f"x={x}"`, `f"{x:.2f}"` | |
| LIT-07 | Raw string | `r"\n"` | |
| LIT-08 | Bytes literal | `b"data"` | |
| LIT-09 | String concatenation (implicit) | `"a" "b"` | |
| LIT-10 | Boolean literal | `True`, `False` | |
| LIT-11 | None literal | `None` | |
| LIT-12 | Ellipsis | `...` | |
| LIT-13 | List literal | `[1, 2, 3]` | |
| LIT-14 | Tuple literal | `(1, 2)`, `1, 2`, `()` | |
| LIT-15 | Dict literal | `{"a": 1}` | |
| LIT-16 | Set literal | `{1, 2, 3}` | |
| LIT-17 | Empty containers | `[]`, `{}`, `set()`, `()` | |

---

## 2. Variables & Assignment (ASG)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| ASG-01 | Simple assignment | `x = 5` | |
| ASG-02 | Multiple targets | `a = b = 0` | |
| ASG-03 | Tuple/list unpacking | `a, b = 1, 2` | |
| ASG-04 | Starred unpacking | `a, *rest = [1,2,3]` | |
| ASG-05 | Augmented assignment | `x += 1` (`-= *= /= //= %= **= &= \|= ^= >>= <<=`) | |
| ASG-06 | Annotated assignment | `x: int = 5` | |
| ASG-07 | Walrus / named expr | `if (n := len(a)) > 0:` | |
| ASG-08 | Chained subscript/attr target | `d["k"] = 1`, `obj.attr = 2` | |
| ASG-09 | `del` statement | `del x`, `del d["k"]` | |
| ASG-10 | `global` declaration | `global counter` | |
| ASG-11 | `nonlocal` declaration | `nonlocal x` | |

---

## 3. Operators & Expressions (OP)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| OP-01 | Arithmetic | `a + b - c * d / e` | |
| OP-02 | Floor division | `a // b` | |
| OP-03 | Modulo | `a % b` | |
| OP-04 | Power | `a ** b` | |
| OP-05 | Unary minus/plus | `-x`, `+x` | |
| OP-06 | Comparison | `< <= > >= == !=` | |
| OP-07 | Chained comparison | `0 < x < 10` | |
| OP-08 | Logical | `and`, `or`, `not` | |
| OP-09 | Identity | `is`, `is not` | |
| OP-10 | Membership | `in`, `not in` | |
| OP-11 | Bitwise | `& \| ^ ~ << >>` | |
| OP-12 | Ternary expression | `a if cond else b` | |
| OP-13 | Indexing | `seq[i]` | |
| OP-14 | Slicing | `seq[1:5]`, `seq[::2]`, `seq[::-1]` | |
| OP-15 | Attribute access | `obj.attr` | |
| OP-16 | Call expression | `f(1, 2)` | |
| OP-17 | Call w/ keyword args | `f(a=1, b=2)` | |
| OP-18 | Call w/ unpacking | `f(*args, **kwargs)` | |
| OP-19 | Lambda | `lambda x: x + 1` | |
| OP-20 | Conditional/parenthesized grouping | `(a + b) * c` | |
| OP-21 | String formatting `%` / `.format()` | `"%d" % n`, `"{}".format(n)` | |

---

## 4. Comprehensions & Generators (CMP)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| CMP-01 | List comprehension | `[x*2 for x in xs]` | |
| CMP-02 | List comp w/ filter | `[x for x in xs if x > 0]` | |
| CMP-03 | Nested comprehension | `[x for row in m for x in row]` | |
| CMP-04 | Dict comprehension | `{k: v for k, v in items}` | |
| CMP-05 | Set comprehension | `{x for x in xs}` | |
| CMP-06 | Generator expression | `(x for x in xs)` | |
| CMP-07 | Comprehension w/ multiple conditions | `[x for x in xs if a if b]` | |

---

## 5. Control Flow (CF)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| CF-01 | `if` | `if c:` | |
| CF-02 | `if / else` | `if c: ... else: ...` | |
| CF-03 | `if / elif / else` | `if a: ... elif b: ... else: ...` | |
| CF-04 | `for` over iterable | `for x in xs:` | |
| CF-05 | `for` over range | `for i in range(n):` | |
| CF-06 | `for` w/ enumerate | `for i, x in enumerate(xs):` | |
| CF-07 | `for` w/ unpacking | `for k, v in d.items():` | |
| CF-08 | `for / else` | `for x in xs: ... else: ...` | |
| CF-09 | `while` | `while c:` | |
| CF-10 | `while True` (infinite) | `while True:` | |
| CF-11 | `while / else` | `while c: ... else: ...` | |
| CF-12 | `break` | `break` | |
| CF-13 | `continue` | `continue` | |
| CF-14 | `pass` | `pass` | |
| CF-15 | `match / case` (3.10+) | `match x: case 1: ...` | |
| CF-16 | match w/ patterns | `case [a, b]:`, `case {"k": v}:`, `case _:` | |

---

## 6. Functions (FN)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| FN-01 | Function definition | `def f():` | |
| FN-02 | Positional params | `def f(a, b):` | |
| FN-03 | Default params | `def f(a, b=2):` | |
| FN-04 | `*args` | `def f(*args):` | |
| FN-05 | `**kwargs` | `def f(**kwargs):` | |
| FN-06 | Keyword-only params | `def f(*, a):` | |
| FN-07 | Positional-only params | `def f(a, /):` | |
| FN-08 | Type-annotated params/return | `def f(a: int) -> str:` | |
| FN-09 | `return` value | `return x` | |
| FN-10 | bare `return` | `return` | |
| FN-11 | Multiple return (tuple) | `return a, b` | |
| FN-12 | `yield` | `yield x` | |
| FN-13 | `yield from` | `yield from gen()` | |
| FN-14 | Decorator | `@decorator` over def | |
| FN-15 | Decorator w/ args | `@dec(1)` | |
| FN-16 | Nested function / closure | `def outer(): def inner(): ...` | |
| FN-17 | Docstring | `def f(): """doc"""` | |
| FN-18 | Default mutable / call w/ kwargs | covered by OP-17 | |

---

## 7. Classes & OOP (CLS)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| CLS-01 | Class definition | `class C:` | |
| CLS-02 | Inheritance | `class C(Base):` | |
| CLS-03 | Multiple inheritance | `class C(A, B):` | |
| CLS-04 | `__init__` constructor | `def __init__(self, x):` | |
| CLS-05 | Instance method | `def m(self):` | |
| CLS-06 | `self.attr` assignment | `self.x = x` | |
| CLS-07 | Class attribute | `class C: count = 0` | |
| CLS-08 | `@staticmethod` | static method | |
| CLS-09 | `@classmethod` | class method (`cls`) | |
| CLS-10 | `@property` | property getter/setter | |
| CLS-11 | Dunder methods | `__str__`, `__repr__`, `__eq__`, `__len__`, `__add__` | |
| CLS-12 | `super()` call | `super().__init__()` | |
| CLS-13 | `@dataclass` | dataclass decorator | |
| CLS-14 | Instantiation | `obj = C(1)` | |
| CLS-15 | `isinstance` / `issubclass` | type checks | |

---

## 8. Exceptions & Context (EXC)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| EXC-01 | `try / except` | `try: ... except: ...` | |
| EXC-02 | `except` specific type | `except ValueError:` | |
| EXC-03 | `except ... as e` | `except E as e:` | |
| EXC-04 | Multiple except | `except (A, B):` | |
| EXC-05 | `try / except / else` | `else:` clause | |
| EXC-06 | `try / finally` | `finally:` clause | |
| EXC-07 | `raise` | `raise ValueError("x")` | |
| EXC-08 | bare `raise` (re-raise) | `raise` | |
| EXC-09 | `raise ... from` | `raise E from cause` | |
| EXC-10 | `assert` | `assert x > 0, "msg"` | |
| EXC-11 | `with` (context manager) | `with open(f) as h:` | |
| EXC-12 | multiple `with` | `with a() as x, b() as y:` | |
| EXC-13 | Custom exception class | `class MyError(Exception):` | |

---

## 9. Modules & Imports (IMP)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| IMP-01 | `import module` | `import math` | |
| IMP-02 | `import a.b.c` | `import os.path` | |
| IMP-03 | `import ... as` | `import numpy as np` | |
| IMP-04 | `from ... import name` | `from math import pi` | |
| IMP-05 | `from ... import a, b` | `from os import getcwd, listdir` | |
| IMP-06 | `from ... import *` | `from math import *` | |
| IMP-07 | `from ... import ... as` | `from x import y as z` | |
| IMP-08 | relative import | `from . import mod` | |
| IMP-09 | `if __name__ == "__main__":` | main guard | |

---

## 10. Built-in Functions (BIF)

Each is a `Call` to a known builtin. Grouped for mapping.

| ID | Functions | Block? |
|----|-----------|--------|
| BIF-01 | `print()` | |
| BIF-02 | `input()` | |
| BIF-03 | `len()` | |
| BIF-04 | `range()` | |
| BIF-05 | Type constructors: `int() float() str() bool() list() tuple() dict() set() frozenset() bytes()` | |
| BIF-06 | `abs() round() pow() divmod()` | |
| BIF-07 | `min() max() sum()` | |
| BIF-08 | `sorted() reversed()` | |
| BIF-09 | `enumerate() zip()` | |
| BIF-10 | `map() filter()` | |
| BIF-11 | `any() all()` | |
| BIF-12 | `type() isinstance() issubclass()` | |
| BIF-13 | `getattr() setattr() hasattr() delattr()` | |
| BIF-14 | `id() hash() repr() ascii()` | |
| BIF-15 | `chr() ord()` | |
| BIF-16 | `bin() hex() oct() format()` | |
| BIF-17 | `open()` | |
| BIF-18 | `iter() next()` | |
| BIF-19 | `vars() dir() globals() locals()` | |
| BIF-20 | `callable() eval() exec() compile()` | |

---

## 11. Built-in Type Methods (MTH)

| ID | Type | Methods | Block? |
|----|------|---------|--------|
| MTH-01 | str | `upper lower strip split join replace find startswith endswith format zfill title capitalize count` | |
| MTH-02 | list | `append extend insert remove pop clear index count sort reverse copy` | |
| MTH-03 | dict | `keys values items get pop update setdefault clear copy` | |
| MTH-04 | set | `add remove discard union intersection difference issubset issuperset` | |
| MTH-05 | tuple | `count index` | |

---

## 12. Standard Library Modules (STD)

| ID | Module | Common API | Block? |
|----|--------|-----------|--------|
| STD-01 | `math` | `sqrt floor ceil pi e sin cos tan log pow factorial gcd` | |
| STD-02 | `random` | `random randint choice shuffle uniform sample seed` | |
| STD-03 | `json` | `loads dumps load dump` | |
| STD-04 | `datetime` | `datetime.now date timedelta strftime` | |
| STD-05 | `time` | `time sleep perf_counter` | |
| STD-06 | `os` | `getcwd listdir path.join environ mkdir remove` | |
| STD-07 | `sys` | `argv exit path stdout` | |
| STD-08 | `collections` | `Counter defaultdict OrderedDict deque namedtuple` | |
| STD-09 | `itertools` | `chain combinations permutations product count cycle groupby` | |
| STD-10 | `functools` | `reduce lru_cache partial wraps` | |
| STD-11 | `re` | `match search findall sub split compile` | |
| STD-12 | `string` | `ascii_letters digits punctuation` | |
| STD-13 | `statistics` | `mean median mode stdev` | |
| STD-14 | `decimal` / `fractions` | `Decimal Fraction` | |
| STD-15 | `pathlib` | `Path` | |
| STD-16 | `csv` | `reader writer DictReader` | |
| STD-17 | `dataclasses` | `dataclass field` | |
| STD-18 | `typing` | `List Dict Optional Union Any` | |
| STD-19 | `enum` | `Enum auto` | |
| STD-20 | `copy` | `copy deepcopy` | |

---

## 13. Async (ASY)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| ASY-01 | `async def` | `async def f():` | |
| ASY-02 | `await` | `await coro()` | |
| ASY-03 | `async for` | `async for x in ait:` | |
| ASY-04 | `async with` | `async with cm() as x:` | |

---

## 14. Comments & Misc (MSC)

| ID | Construct | Example | Block? |
|----|-----------|---------|--------|
| MSC-01 | Line comment | `# comment` | |
| MSC-02 | Inline comment | `x = 1  # note` | |
| MSC-03 | Module/function docstring | `"""doc"""` | |
| MSC-04 | Line continuation | `a = 1 + \` | |
| MSC-05 | Semicolon-separated stmts | `a = 1; b = 2` | |
| MSC-06 | Type alias (3.12) | `type Vec = list[float]` | |

---

## Currently-supported parser AST nodes (baseline)

For reference, `src/utils/parser.js` currently parses these AST node types:
`Program, Assign, AugAssign, For, While, If, Call, ListComp, Ternary, Attribute, Name, Num, Str, Bool, List, BinOp, Range, FunctionDef, Return, Lambda, ClassDef, Pass, Import`.

Existing custom Blockly blocks: `sprite_move/turn/pen/color/say`, `cv2_*`, `class_def`, `raw_statement`, `raw_expression`, `function_return`, `list_append_custom`. Plus standard Blockly library blocks (logic, loops, math, text, lists, variables, procedures) loaded from CDN and listed in `index.html`'s toolbox.
