# 📦 Python-Blockly 1:1 Syntax Mapping Checklist & Uniform AST Normalization Plan

This document defines the E2E checklist to verify that all Python syntax structures map 1:1 to visual blocks, and outlines the compiler desugaring and AI-assisted normalization architecture to parse diverse Python styles into uniform Blockly models.

---

## 🎯 1. Python-to-Blockly 1:1 Syntax Mapping Checklist

To achieve a lossless roundtrip, every Python syntax token must have an exact, un-editable visual representation in the Blockly workspace. The following checklist defines these mappings:

### A. Literals & Core Types
- [x] **Numbers (Float/Int)**: 
  * *Python*: `x = 42` or `y = 3.14`
  * *Blockly Block*: `math_number`
- [x] **Strings**:
  * *Python*: `text = "hello world"`
  * *Blockly Block*: `text`
- [x] **Booleans**:
  * *Python*: `flag = True` or `flag = False`
  * *Blockly Block*: `logic_boolean`
- [x] **Lists**:
  * *Python*: `items = [1, 2, 3]`
  * *Blockly Block*: `lists_create_with`

### B. Core Control Flow
- [x] **Conditionals (If-Elif-Else)**:
  * *Python*: `if cond: ... elif cond2: ... else: ...`
  * *Blockly Block*: `controls_if` (with dynamic else/elif mutation inputs)
- [x] **For Loops (Range-based)**:
  * *Python*: `for i in range(5): ...`
  * *Blockly Block*: `controls_repeat_ext` or `controls_forEach`
- [x] **While Loops**:
  * *Python*: `while True: ...` or `while speed < 100: ...`
  * *Blockly Block*: `controls_whileUntil`

### C. Variables & Operations
- [x] **Assignments**:
  * *Python*: `x = 10`
  * *Blockly Block*: `variables_set`
- [x] **Augmented Assignments**:
  * *Python*: `x += 5` (desugared to `x = x + 5`)
  * *Blockly Block*: `variables_set` + `math_arithmetic`
- [x] **Arithmetic Operators**:
  * *Python*: `x + y`, `x - y`, `x * y`, `x / y`
  * *Blockly Block*: `math_arithmetic`
- [x] **Comparisons**:
  * *Python*: `x == y`, `x < y`, `x > y`, `x <= y`, `x >= y`, `x != y`
  * *Blockly Block*: `logic_compare`
- [x] **Logical Operators**:
  * *Python*: `a and b`, `a or b`, `not c`
  * *Blockly Block*: `logic_operation` / `logic_negate`

### D. Standard Built-in Functions & Methods
- [x] **Print Output**:
  * *Python*: `print("hello world")` (mapped to `text_print` block)
  * *Blockly Block*: `text_print`
- [x] **List Append**:
  * *Python*: `arr.append(x)` (mapped to custom list append block)
  * *Blockly Block*: `list_append_custom`

### E. Drawing & Graphics (Motion / Pen)
- [x] **Pen Controls**:
  * *Python*: `sprite.pen_down()`, `sprite.pen_up()`
  * *Blockly Block*: `sprite_pen` (with un-editable static pen selection dropdowns)
- [x] **Set Color**:
  * *Python*: `sprite.color("#3b82f6")`
  * *Blockly Block*: `sprite_color`
- [x] **Motion Commands**:
  * *Python*: `sprite.move(100)`, `sprite.turn_right(90)`, `sprite.turn_left(90)`
  * *Blockly Block*: `sprite_move` / `sprite_turn`
- [x] **Bubble Text**:
  * *Python*: `sprite.say("Star complete!")`
  * *Blockly Block*: `sprite_say`

### F. High-Fidelity Static Presets (OpenCV `cv2`)
- [x] **Static Block Integrations**:
  * *Python*: `cv2.imread(path)`, `cv2.imshow(win, img)`, `cv2.VideoCapture(dev)`, `cv2.waitKey(delay)`, `cv2.destroyAllWindows()`
  * *Blockly Block*: Fully static slate-themed blocks under `Abstract Libraries` category with un-editable titles and standard value input slots.

---

## ⚡ 2. Diverse Expression Normalization Strategy (AST Desugaring)

To maintain 100% roundtrip stability and clean Blockly representation, the harness utilizes a **Desugaring Compiler Layer** (`desugarer.js`) to rewrite diverse Python syntax forms into **uniform, basic syntax structures** that Blockly can natively render.

```
       [Diverse Python Code]
                 │
                 ▼
       [Custom Lexer & Parser]
                 │
                 ▼
      [Original AST Structure]
                 │
                 ▼
    ┌───────────────────────────┐
    │  AST Desugaring Compiler  │  ◄── Transforms sugar to basic constructs
    └───────────────────────────┘
                 │
                 ▼
      [Normalized Basic AST]
                 │
                 ▼
      [Visual Blockly Blocks]
```

### Unrolling Normalization Rules:

1. **List Comprehensions $\rightarrow$ For Loops**:
   * *Complex Style*: `y = [x * 2 for x in items]`
   * *With Filter Style*: `y = [x * 2 for x in items if x > 2]`
   * *Desugared Uniform Style*:
     ```python
     _list_comp_res_0 = []
     for x in items:
         if x > 2:
             _list_comp_res_0.append(x * 2)
     y = _list_comp_res_0
     ```
   * *Blockly Mapping*: Maps seamlessly to a list initialization, a standard `for-each` block, an optional nested `controls_if` block, and a `list_append` block.

2. **Ternary Operators $\rightarrow$ If-Else Blocks**:
   * *Complex Style*: `status = "Danger" if speed > 100 else "Safe"`
   * *Desugared Uniform Style*:
     ```python
     _ternary_res_0 = None
     if speed > 100:
         _ternary_res_0 = "Danger"
     else:
         _ternary_res_0 = "Safe"
     status = _ternary_res_0
     ```
   * *Blockly Mapping*: Renders beautifully as a standard visual conditional block (`controls_if`) and variables assignments.

3. **Chained Comparisons $\rightarrow$ Logical Conjunctions (`and`)**:
   * *Complex Style*: `if 60 < speed < 120:`
   * *Desugared Uniform Style*:
     ```python
     if (60 < speed) and (speed < 120):
     ```
   * *Blockly Mapping*: Translated directly to a standard visual logical `and` block connecting two numeric comparison blocks.

---

## 🤖 3. AI-Assisted Normalization & Vibe Coding Architecture

While hard-coded compiler rules are highly stable for list comprehensions and ternaries, Python contains massive syntactical variety (lambdas, dict comprehensions, class abstractions, multi-dimensional array slicing) that would make a rules-based parser excessively bloated.

We propose a hybrid **AI-Assisted Normalization Engine** combining LLM intelligence with our rigid AST compiler:

```
                  Natural Language Prompt / Advanced Code
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │    AI Vibe Coding Agent     │  (Gemini / Claude API)
                      └─────────────────────────────┘
                                     │
                        Re-writes advanced code to
                        syntactically simple Python
                                     ▼
                      ┌─────────────────────────────┐
                      │    AST Parser / Compiler    │  (Rigid, 100% Deterministic)
                      └─────────────────────────────┘
                                     │
                                     ▼
                          [Visual Visual Blocks]
```

### Proposed AI Normalization Pipeline:

1. **Pre-processing Hook**:
   When the user types advanced Python or uses the AI Agent panel, the prompt or code is fed to the **AI Normalization Agent** with a specialized system prompt:
   > "You are an expert compiler desugarer. Rewrite the following Python code to use ONLY basic variables, for/while loops, simple standard functions (`print`, `append`), standard list operations, and basic if/else conditionals. Eliminate lambdas, classes, list comprehensions, and dictionary slicing by expanding them into explicit, simple procedural logic. Output ONLY the simplified Python code."

2. **AST Validation Guard**:
   * The simplified code returned by the AI is instantly validated by our client-side custom AST parser.
   * If parsing is successful, it is synchronized into the visual blocks.
   * If a syntax error occurs, it falls back to the original code or warns the user, ensuring sandbox safety.

3. **Runtime Synchronization**:
   This hybrid approach allows the user to write extremely high-level Python code, while the visual editor shows cleanly laid-out, simple, and perfectly understandable visual blocks—maximizing the pedagogical value of BlockPy!
