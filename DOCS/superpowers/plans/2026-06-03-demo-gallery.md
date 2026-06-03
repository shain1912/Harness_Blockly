# Demo Example Gallery + Lossless Round-trip Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a curated in-app demo snippet gallery that doubles as an automated lossless round-trip test suite, after fixing the parser round-trip bugs that would break demo snippets.

**Architecture:** Snippets live in one module (`src/examples/snippets.js`) consumed by BOTH the UI dropdown and the Playwright tests (single source of truth). Parser bug fixes are targeted edits to `src/utils/parser.js` (no rewrite). Each fix is gated by a fast Node-level round-trip regression test before any browser test.

**Tech Stack:** React 19 + Vite, hand-written Python compiler in `src/utils/parser.js` (attached to `window.BlockPyParser`, also `module.exports` for Node), Blockly from CDN, Pyodide for execution, Playwright for e2e.

**Conventions (from CLAUDE.md):** A new Blockly block needs BOTH `Blockly.Blocks['x']` and `Blockly.Python['x']`, a `Blockly.Python.forBlock['x']` alias, a toolbox entry in `index.html`, and round-trip handling in `astToBlockly` / the `Parser`. Field-name parity between generator and parser is critical. `parser.js` ends with a `module.exports` block and `window.X = X` — preserve both.

**Node round-trip harness (used by several tasks):** a quick semantic-equality check.
```js
// helper used in node -e snippets: normalize whitespace & operator spacing
const norm = s => s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
function rt(P, src) {
  const ast = new P.Parser(new P.Tokenizer(src).tokenize()).parse();
  return P.astToPython(ast);
}
```

---

### Task 1: Dedicated `subscript_get` block (fixes bug #1, subscript read)

**Files:**
- Modify: `src/utils/parser.js` (new block defn near the other W4 blocks ~line 4843; `convertExpressionToBlock` `case 'Subscript'` ~line 3717; forBlock alias list ~line 4934)
- Modify: `index.html` (Collections category)
- Test: `node -e` round-trip + manual block-type check

- [ ] **Step 1: Write the failing Node round-trip test**

Run this and confirm it currently FAILS (prints `d[0]` / drops key):
```bash
node -e "const P=require('./src/utils/parser.js');const norm=s=>s.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();const rt=s=>P.astToPython(new P.Parser(new P.Tokenizer(s).tokenize()).parse());for(const s of ['x = d[\"a\"]','y = t[1]','z = m[i][j]']){const o=rt(s);console.log(norm(o)===norm(s)?'OK   ':'FAIL ',JSON.stringify(s),'->',JSON.stringify(norm(o)));}"
```
Expected now: the round-trip itself already regenerates `d["a"]` from the AST (the AST keeps the key); the **block** path is what loses it. So ALSO verify the block path via a temporary check:
```bash
node -e "const P=require('./src/utils/parser.js');const ast=new P.Parser(new P.Tokenizer('x = d[\"a\"]').tokenize()).parse();console.log(JSON.stringify(P.astToBlockly(ast),null,1))" 
```
Expected now: a `lists_getIndex` block whose `AT` is a `text` block — the defect to replace.

- [ ] **Step 2: Add the `subscript_get` block definition + generator**

Add near the other W4 block defns in `src/utils/parser.js` (e.g. just before `Blockly.Blocks['set_attribute']`):
```js
// [Demo] Dedicated subscript read: obj[key]  (works for list/dict/tuple/str; 0-based, any key type)
Blockly.Blocks['subscript_get'] = {
  init: function() {
    this.appendValueInput("OBJECT").setCheck(null);
    this.appendValueInput("KEY").appendField("[");
    this.appendDummyInput().appendField("]");
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour("#16a085");
    this.setTooltip("Subscript access obj[key] for lists, dicts, tuples, strings.");
    this.setHelpUrl("");
  }
};
Blockly.Python['subscript_get'] = function(block) {
  const obj = Blockly.Python.valueToCode(block, 'OBJECT', Blockly.Python.ORDER_MEMBER) || 'obj';
  const key = Blockly.Python.valueToCode(block, 'KEY', Blockly.Python.ORDER_NONE) || '0';
  return [`${obj}[${key}]`, Blockly.Python.ORDER_MEMBER];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['subscript_get'] = Blockly.Python['subscript_get'];
}
```

- [ ] **Step 3: Route `convertExpressionToBlock` `case 'Subscript'` to `subscript_get`**

Replace the existing `case 'Subscript':` body (~line 3717, the one returning `lists_getIndex`) with:
```js
    // [Demo] Subscript access obj[key] -> dedicated subscript_get block (lossless, any key)
    case 'Subscript':
      return {
        "type": "subscript_get",
        "id": makeBlockId(),
        "inputs": {
          "OBJECT": { "block": convertExpressionToBlock(node.value) },
          "KEY": { "block": convertExpressionToBlock(node.index) }
        }
      };
```

- [ ] **Step 4: Add the block to the Collections toolbox category**

In `index.html`, inside `<category name="Collections" ...>`, add:
```html
      <block type="subscript_get"></block>
```

- [ ] **Step 5: Verify the block path now preserves the key**

```bash
node -e "const P=require('./src/utils/parser.js');const ast=new P.Parser(new P.Tokenizer('x = d[\"a\"]').tokenize()).parse();const j=JSON.stringify(P.astToBlockly(ast));console.log(j.includes('subscript_get')?'OK subscript_get present':'FAIL');console.log(j.includes('\"a\"')?'OK key preserved':'FAIL key lost')"
```
Expected: both OK.

- [ ] **Step 6: Commit**
```bash
git add src/utils/parser.js index.html
git commit -m "fix: dedicated subscript_get block preserves dict/list/tuple keys on round-trip"
```

---

### Task 2: Dedicated `subscript_set` block (fixes bug #3, subscript assignment)

**Files:**
- Modify: `src/utils/parser.js` (block defn near `subscript_get`; `convertStatementToBlock` `case 'Assign'` Subscript branch ~line 2364; forBlock alias list)
- Modify: `index.html` (Collections category)

- [ ] **Step 1: Confirm current defect**
```bash
node -e "const P=require('./src/utils/parser.js');const ast=new P.Parser(new P.Tokenizer('d[\"k\"] = 7').tokenize()).parse();console.log(JSON.stringify(P.astToBlockly(ast)))"
```
Expected now: a `lists_setIndex` block with the key in a `text`/Number `AT` (list-only, lossy for dict keys).

- [ ] **Step 2: Add the `subscript_set` block definition + generator**

Add right after the `subscript_get` defn in `src/utils/parser.js`:
```js
// [Demo] Dedicated subscript assignment: obj[key] = value
Blockly.Blocks['subscript_set'] = {
  init: function() {
    this.appendValueInput("OBJECT").appendField("set");
    this.appendValueInput("KEY").appendField("[");
    this.appendValueInput("VALUE").appendField("] =");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#16a085");
    this.setTooltip("Subscript assignment obj[key] = value.");
    this.setHelpUrl("");
  }
};
Blockly.Python['subscript_set'] = function(block) {
  const obj = Blockly.Python.valueToCode(block, 'OBJECT', Blockly.Python.ORDER_MEMBER) || 'obj';
  const key = Blockly.Python.valueToCode(block, 'KEY', Blockly.Python.ORDER_NONE) || '0';
  const val = Blockly.Python.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || 'None';
  return `${obj}[${key}] = ${val}\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['subscript_set'] = Blockly.Python['subscript_set'];
}
```

- [ ] **Step 3: Route the `Assign`→Subscript-target branch to `subscript_set`**

In `convertStatementToBlock`, replace the `if (tgt && tgt.type === 'Subscript') { ... lists_setIndex ... }` block (~line 2365) with:
```js
      // [Demo] Subscript assignment d[k] = v -> dedicated subscript_set block (lossless)
      if (tgt && tgt.type === 'Subscript') {
        return {
          "type": "subscript_set",
          "id": makeBlockId(),
          "inputs": {
            "OBJECT": { "block": convertExpressionToBlock(tgt.value) },
            "KEY": { "block": convertExpressionToBlock(tgt.index) },
            "VALUE": { "block": convertExpressionToBlock(node.value) }
          }
        };
      }
```

- [ ] **Step 4: Add to toolbox**

In `index.html` Collections category add:
```html
      <block type="subscript_set"></block>
```

- [ ] **Step 5: Verify**
```bash
node -e "const P=require('./src/utils/parser.js');const j=JSON.stringify(P.astToBlockly(new P.Parser(new P.Tokenizer('d[\"k\"] = 7').tokenize()).parse()));console.log(j.includes('subscript_set')&&j.includes('\"k\"')?'OK':'FAIL',j)"
```
Expected: OK.

- [ ] **Step 6: Commit**
```bash
git add src/utils/parser.js index.html
git commit -m "fix: dedicated subscript_set block preserves keys for obj[key]=value"
```

---

### Task 3: Comprehension iterable stays an expression (fixes bug #2)

**Files:**
- Modify: `src/utils/parser.js` (`convertExpressionToBlock`: add `case 'Range'`; change the final `text` fallback to `raw_expression`)

- [ ] **Step 1: Confirm defect**
```bash
node -e "const P=require('./src/utils/parser.js');const j=JSON.stringify(P.astToBlockly(new P.Parser(new P.Tokenizer('g = {k: k for k in range(3)}').tokenize()).parse()));console.log(j.includes(\"'range(3)'\")||j.includes('\\\"range(3)\\\"')?'DEFECT: range became text':'ok',j)"
```
Expected now: DEFECT (range serialized as a text string literal).

- [ ] **Step 2: Add `case 'Range'` and fix the fallback in `convertExpressionToBlock`**

Just before the final fallback `return { "type": "text", ... }` (~line 3754), add:
```js
    // [Demo] range(...) in expression context (e.g. comprehension iterable) -> lossless raw_expression
    case 'Range':
      return {
        "type": "raw_expression",
        "id": makeBlockId(),
        "fields": { "EXPR": astToPython(node) }
      };
```
Then change the trailing fallback from a `text` string literal to a lossless `raw_expression`:
```js
  // Fallback for unrecognized expressions: preserve verbatim (lossless), not a string literal
  return {
    "type": "raw_expression",
    "id": makeBlockId(),
    "fields": { "EXPR": astToPython(node) }
  };
```

- [ ] **Step 3: Verify (range no longer a string literal)**
```bash
node -e "const P=require('./src/utils/parser.js');const j=JSON.stringify(P.astToBlockly(new P.Parser(new P.Tokenizer('g = {k: k for k in range(3)}').tokenize()).parse()));console.log(!j.includes(\"'range(3)'\")&&j.includes('range(3)')?'OK lossless range':'FAIL',j)"
```
Expected: OK.

- [ ] **Step 4: Commit**
```bash
git add src/utils/parser.js
git commit -m "fix: comprehension iterables (range) stay lossless expressions, not string literals"
```

---

### Task 4: Nested function defs round-trip losslessly (fixes bug #4)

**Files:**
- Modify: `src/utils/parser.js` (`convertStatementListToBlock` and/or `convertStatementToBlock` `case 'FunctionDef'` ~line 2632)

**Approach:** A `FunctionDef` that appears INSIDE another statement list cannot be a `procedures_def*` hat block (no prev/next connection → `MissingConnection`). Detect nesting and emit a lossless `raw_statement` instead. Module-level defs keep using `procedures_def*`.

- [ ] **Step 1: Write the failing Node round-trip test**
```bash
node -e "const P=require('./src/utils/parser.js');const src='def outer():\n    def inner():\n        return 1\n    return inner()';const j=JSON.stringify(P.astToBlockly(new P.Parser(new P.Tokenizer(src).tokenize()).parse()));console.log('serializes without throwing:', j.length>0)"
```
Then load it in the browser path: the existing failure is a Blockly `MissingConnection` at load. The Node check above won't throw, so the authoritative test is the Playwright render check added in Task 9 (a nested-def snippet is NOT in the gallery, but a regression test asserts nested-def converts to a `raw_statement`, not a nested `procedures_*`).

- [ ] **Step 2: Make `convertStatementListToBlock` emit raw_statement for nested defs**

`convertStatementListToBlock(statements)` chains each statement's block via `next`. Add a parameter / wrapper so that when converting a statement list that is itself a function/loop body, a `FunctionDef` element is converted to a `raw_statement` carrying its full source:
```js
// inside the per-statement conversion loop in convertStatementListToBlock,
// before calling convertStatementToBlock(stmt):
function _stmtBlock(stmt, isNested) {
  if (isNested && stmt.type === 'FunctionDef') {
    return {
      "type": "raw_statement",
      "id": makeBlockId(),
      "fields": { "STMT": astToPython(stmt) }   // full def source, multi-line, lossless
    };
  }
  return convertStatementToBlock(stmt);
}
```
Wire `convertStatementListToBlock` to pass `isNested = true` for bodies it builds (it is only ever called for nested suites — function bodies, loop bodies, branch bodies — so treating all its FunctionDef children as nested is correct; top-level defs are handled by `astToBlockly`'s top-level loop, not this function). Confirm by reading `astToBlockly`'s top-level loop: it iterates `astNode.body` directly and calls `convertStatementToBlock`, so module-level defs are unaffected.

- [ ] **Step 3: Verify the `raw_statement` generator re-emits multi-line source faithfully**

Check `Blockly.Python['raw_statement']` preserves newlines (read its defn). If it collapses newlines, update it to emit the stored `STMT` verbatim followed by `\n`. Confirm:
```bash
node -e "const P=require('./src/utils/parser.js');const src='def outer():\n    def inner():\n        return 1\n    return inner()';const out=P.astToPython(new P.Parser(new P.Tokenizer(src).tokenize()).parse());console.log(out)"
```
Expected: the original source (astToPython is the AST path and already correct — the raw_statement path is the block path, validated in Task 9).

- [ ] **Step 4: Commit**
```bash
git add src/utils/parser.js
git commit -m "fix: nested function defs convert to lossless raw_statement (Blockly hat blocks cannot nest)"
```

---

### Task 5: Tuple-unpack + following multi-arg call (fixes bug #5)

**Files:**
- Modify: `src/utils/parser.js` (investigate `unpack_assign` round-trip and multi-arg `print` after an unpack)

- [ ] **Step 1: Write the failing Node round-trip test**
```bash
node -e "const P=require('./src/utils/parser.js');const norm=s=>s.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();const src='x, y = 1, 2\nprint(x, y)';const out=P.astToPython(new P.Parser(new P.Tokenizer(src).tokenize()).parse());console.log(norm(out)===norm(src)?'OK':'FAIL','->',JSON.stringify(norm(out)))"
```
Expected now: FAIL if the parser drops `y` from `print(x, y)`. (If the AST path is fine but the BLOCK path drops it, the authoritative check is the Playwright test in Task 9.)

- [ ] **Step 2: Diagnose and fix**

Inspect the parse of `x, y = 1, 2` (the `MultiAssign`/`unpack_assign`/tuple-target path in `convertStatementToBlock` ~line 2392) and the parse of the following `print(x, y)` call's arg list. The reported defect is the SECOND statement losing its second arg, which points at the call-argument parsing or the `unpack_assign` block consuming the following line. Fix so:
- `x, y = 1, 2` → an `unpack_assign` (or `multiple_assign`) block that regenerates `x, y = 1, 2`, AND
- the subsequent `print(x, y)` retains both args.

- [ ] **Step 3: Verify both the Node round-trip and the block path**
```bash
node -e "const P=require('./src/utils/parser.js');const norm=s=>s.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();const src='x, y = 1, 2\nprint(x, y)';console.log(norm(P.astToPython(new P.Parser(new P.Tokenizer(src).tokenize()).parse()))===norm(src)?'OK':'FAIL')"
```
Expected: OK.

- [ ] **Step 4: Commit**
```bash
git add src/utils/parser.js
git commit -m "fix: tuple-unpack assignment no longer drops args from the following call"
```

---

### Task 6: `global` body converts to clean blocks (fixes bug #6)

**Files:**
- Modify: `src/utils/parser.js` (function-body conversion when a `global` statement is present)

- [ ] **Step 1: Write the failing check (block path)**
```bash
node -e "const P=require('./src/utils/parser.js');const src='counter = 0\ndef inc():\n    global counter\n    counter = counter + 1';const j=JSON.stringify(P.astToBlockly(new P.Parser(new P.Tokenizer(src).tokenize()).parse()));console.log('global_statement present:',j.includes('global_statement'));console.log('raw_statement leak:',j.includes('raw_statement'))"
```
Expected now: `global_statement present: true`, `raw_statement leak: true` (the leak is the defect).

- [ ] **Step 2: Diagnose and fix**

The function body `[Global, Assign]` should chain `global_statement` → assignment block via `convertStatementListToBlock`. Find why the assignment (or the def) falls back to `raw_statement` and fix the responsible `case` so the body is clean blocks. (Likely the def-body conversion mis-detects the trailing statement; confirm `case 'Assign'` handles `counter = counter + 1` directly.)

- [ ] **Step 3: Verify no leak**
```bash
node -e "const P=require('./src/utils/parser.js');const src='counter = 0\ndef inc():\n    global counter\n    counter = counter + 1';const j=JSON.stringify(P.astToBlockly(new P.Parser(new P.Tokenizer(src).tokenize()).parse()));console.log(j.includes('global_statement')&&!j.includes('raw_statement')?'OK clean body':'FAIL',j)"
```
Expected: OK.

- [ ] **Step 4: Commit**
```bash
git add src/utils/parser.js
git commit -m "fix: global declaration in a function body no longer leaks to raw_statement"
```

---

### Task 7: Snippet data module (single source of truth)

**Files:**
- Create: `src/examples/snippets.js`
- Modify: `src/main.jsx` (side-effect import so `window.BlockPyExamples` exists)

- [ ] **Step 1: Create `src/examples/snippets.js`**

Author the curated set. Each entry: `{ id, title, category, code, expectedStdout (string[]), desugar (bool), execute (bool) }`. Categories in order: Basics, Data, Control, Functions, Exceptions, Classes, OpenCV (OpenCV added in Task 8). Full content for the non-OpenCV snippets (use exactly these — they are chosen to round-trip losslessly after Tasks 1–6):
```js
const DEMO_SNIPPETS = [
  { id:'basics-arith', title:'변수와 산술', category:'Basics', desugar:true, execute:true,
    code:'x = 10\ny = 3\nprint(x + y)\nprint(x * y)\nprint(x // y)\nprint(x % y)',
    expectedStdout:['13','30','3','1'] },
  { id:'basics-str', title:'문자열', category:'Basics', desugar:true, execute:true,
    code:'name = "BlockPy"\nprint("Hello, " + name + "!")\nprint(name.upper())\nprint(len(name))',
    expectedStdout:['Hello, BlockPy!','BLOCKPY','7'] },
  { id:'data-list', title:'리스트', category:'Data', desugar:true, execute:true,
    code:'nums = [1, 2, 3, 4, 5]\nnums.append(6)\nprint(nums)\nprint(nums[0])\nprint(sum(nums))',
    expectedStdout:['[1, 2, 3, 4, 5, 6]','1','21'] },
  { id:'data-dict', title:'딕셔너리', category:'Data', desugar:true, execute:true,
    code:'scores = {"alice": 90, "bob": 85}\nscores["carol"] = 95\nprint(scores["alice"])\nprint(len(scores))',
    expectedStdout:['90','3'] },
  { id:'data-set-tuple', title:'집합과 튜플', category:'Data', desugar:true, execute:true,
    code:'s = {1, 2, 2, 3}\nprint(len(s))\npoint = (3, 4)\nprint(point[0] + point[1])',
    expectedStdout:['3','7'] },
  { id:'ctrl-if', title:'조건문', category:'Control', desugar:true, execute:true,
    code:'score = 75\nif score >= 90:\n    print("A")\nelif score >= 70:\n    print("B")\nelse:\n    print("C")',
    expectedStdout:['B'] },
  { id:'ctrl-for', title:'반복문 (for)', category:'Control', desugar:true, execute:true,
    code:'total = 0\nfor i in range(1, 6):\n    total = total + i\nprint(total)',
    expectedStdout:['15'] },
  { id:'ctrl-while', title:'반복문 (while)', category:'Control', desugar:true, execute:true,
    code:'n = 5\nresult = 1\nwhile n > 0:\n    result = result * n\n    n = n - 1\nprint(result)',
    expectedStdout:['120'] },
  { id:'fn-def', title:'함수', category:'Functions', desugar:true, execute:true,
    code:'def square(x):\n    return x * x\nprint(square(5))',
    expectedStdout:['25'] },
  { id:'fn-listcomp', title:'리스트 컴프리헨션', category:'Functions', desugar:false, execute:true,
    code:'nums = [1, 2, 3, 4, 5]\nsquares = [n * n for n in nums]\nprint(squares)',
    expectedStdout:['[1, 4, 9, 16, 25]'] },
  { id:'fn-dictcomp', title:'딕셔너리 컴프리헨션', category:'Functions', desugar:false, execute:true,
    code:'squares = {n: n * n for n in range(1, 4)}\nprint(squares[3])',
    expectedStdout:['9'] },
  { id:'exc-try', title:'예외 처리', category:'Exceptions', desugar:true, execute:true,
    code:'try:\n    x = int("abc")\nexcept ValueError:\n    print("invalid number")\nfinally:\n    print("done")',
    expectedStdout:['invalid number','done'] },
  { id:'gen-yield', title:'제너레이터', category:'Exceptions', desugar:true, execute:true,
    code:'def countdown(n):\n    while n > 0:\n        yield n\n        n = n - 1\nprint(list(countdown(3)))',
    expectedStdout:['[3, 2, 1]'] },
  { id:'cls-basic', title:'클래스', category:'Classes', desugar:true, execute:true,
    code:'class Dog:\n    def __init__(self, name):\n        self.name = name\n    def bark(self):\n        return self.name + " says woof"\nd = Dog("Rex")\nprint(d.bark())',
    expectedStdout:['Rex says woof'] },
];
if (typeof window !== 'undefined') window.BlockPyExamples = DEMO_SNIPPETS;
if (typeof module !== 'undefined') module.exports = { DEMO_SNIPPETS };
```

- [ ] **Step 2: Side-effect import in `src/main.jsx`**

Add alongside the other `src/utils/*` side-effect imports:
```js
import './examples/snippets.js';
```

- [ ] **Step 3: Sanity-check every non-OpenCV snippet round-trips losslessly at the AST level**
```bash
node -e "const {DEMO_SNIPPETS}=require('./src/examples/snippets.js');const P=require('./src/utils/parser.js');const norm=s=>s.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();let bad=0;for(const sn of DEMO_SNIPPETS){const out=P.astToPython(new P.Parser(new P.Tokenizer(sn.code).tokenize()).parse());if(norm(out)!==norm(sn.code)){bad++;console.log('FAIL',sn.id,'\n  IN :',JSON.stringify(norm(sn.code)),'\n  OUT:',JSON.stringify(norm(out)));}}console.log(bad?bad+' snippets fail AST round-trip — ASK THE USER per directive':'ALL snippets round-trip OK')"
```
Expected: `ALL snippets round-trip OK`. If any FAIL, STOP and ask the user (per the "always ask about missing/ambiguous blocks" directive) whether to fix deeper, swap the snippet, or mark it render-only.

- [ ] **Step 4: Commit**
```bash
git add src/examples/snippets.js src/main.jsx
git commit -m "feat: demo snippet data module (single source of truth for gallery + tests)"
```

---

### Task 8: OpenCV demo snippets

**Files:**
- Modify: `src/examples/snippets.js` (append OpenCV entries)

**Note:** Execution depends on the Pyodide `cv2` mock in `src/utils/pyodideRunner.js`. First read that mock to learn which cv2 calls it supports; mark `execute: true` only for calls the mock implements, otherwise `execute: false` (render+convert is the assertion).

- [ ] **Step 1: Read the cv2 mock to determine runnable calls**

Read `src/utils/pyodideRunner.js` (the `import cv2` mock setup ~line 121). List which functions (`imread`, `cvtColor`, `imshow`, `VideoCapture`, `GaussianBlur`, `Canny`, …) are mocked.

- [ ] **Step 2: Append OpenCV snippets**

Append to `DEMO_SNIPPETS` (set `execute` per Step 1 findings; default `false` if unsure):
```js
  { id:'cv-gray', title:'OpenCV: 그레이스케일', category:'OpenCV', desugar:true, execute:false,
    code:'import cv2\nimg = cv2.imread("test.jpg")\ngray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\ncv2.imshow("gray", gray)',
    expectedStdout:[] },
  { id:'cv-capture', title:'OpenCV: 카메라 캡처', category:'OpenCV', desugar:true, execute:false,
    code:'import cv2\ncap = cv2.VideoCapture(0)\nret, frame = cap.read()\ncv2.imshow("frame", frame)',
    expectedStdout:[] },
  { id:'cv-edges', title:'OpenCV: 블러 & 에지', category:'OpenCV', desugar:true, execute:false,
    code:'import cv2\nimg = cv2.imread("photo.png")\nblur = cv2.GaussianBlur(img, (5, 5), 0)\nedges = cv2.Canny(blur, 100, 200)\ncv2.imshow("edges", edges)',
    expectedStdout:[] },
```

- [ ] **Step 3: Confirm OpenCV snippets at least convert to blocks without throwing**
```bash
node -e "const {DEMO_SNIPPETS}=require('./src/examples/snippets.js');const P=require('./src/utils/parser.js');for(const sn of DEMO_SNIPPETS.filter(s=>s.category==='OpenCV')){try{P.astToBlockly(new P.Parser(new P.Tokenizer(sn.code).tokenize()).parse());console.log('OK',sn.id);}catch(e){console.log('THROW',sn.id,e.message);}}"
```
Expected: all OK. If any THROW (a cv2 construct has no block), STOP and ask the user.

- [ ] **Step 4: Commit**
```bash
git add src/examples/snippets.js
git commit -m "feat: OpenCV demo snippets (render+convert; execution best-effort via cv2 mock)"
```

---

### Task 9: Examples dropdown in the UI

**Files:**
- Modify: `src/components/PythonEditor.jsx` (add a grouped `<select>`)
- Modify: `src/App.jsx` (handler: set code + desugar checkbox)

- [ ] **Step 1: Read `PythonEditor.jsx` and `App.jsx` to learn the props/state**

Identify how `code`/`setCode` flow (App owns `code` state; PythonEditor receives it) and how `#toggle-desugar` is controlled.

- [ ] **Step 2: Add the dropdown to `PythonEditor.jsx`**

Above the `#python-code` textarea, render a `<select id="example-picker">` whose options are grouped by `category` from `window.BlockPyExamples`. On change, call a new prop `onLoadExample(snippet)`:
```jsx
<select id="example-picker" defaultValue="" onChange={e => {
  const sn = (window.BlockPyExamples || []).find(s => s.id === e.target.value);
  if (sn) onLoadExample(sn);
}}>
  <option value="" disabled>예제 선택…</option>
  {Object.entries((window.BlockPyExamples || []).reduce((g, s) => {
    (g[s.category] = g[s.category] || []).push(s); return g;
  }, {})).map(([cat, items]) => (
    <optgroup key={cat} label={cat}>
      {items.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
    </optgroup>
  ))}
</select>
```

- [ ] **Step 3: Wire `onLoadExample` in `App.jsx`**

Pass `onLoadExample={sn => { setCode(sn.code); setAutoDesugar(sn.desugar); }}` (use the actual desugar state setter name found in Step 1). Do NOT auto-convert — the presenter clicks Convert live.

- [ ] **Step 4: Manual smoke (dev server already runs on :3000)**

Load the app, pick "딕셔너리", confirm the editor fills and the desugar checkbox matches `sn.desugar`.

- [ ] **Step 5: Commit**
```bash
git add src/components/PythonEditor.jsx src/App.jsx
git commit -m "feat: Examples dropdown loads demo snippets into the Python editor"
```

---

### Task 10: Automated round-trip + execution test suite

**Files:**
- Create: `tests/examples_roundtrip.spec.js`

- [ ] **Step 1: Write the spec**

For each snippet in `DEMO_SNIPPETS`: (a) Node-level AST round-trip equality, (b) browser render with the expected dedicated block types and NO lossy `text`/`raw_statement`-of-source for `execute:true` snippets, (c) browser execute asserting each `expectedStdout` substring. Mirror selectors from `tests/test_p0_p1.spec.js` and `tests/test_new_blocks.spec.js`.
```js
const { test, expect } = require('@playwright/test');
const { DEMO_SNIPPETS } = require('../src/examples/snippets.js');
const P = require('../src/utils/parser.js');
const norm = s => s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();

test.describe('demo snippets are lossless & runnable', () => {
  for (const sn of DEMO_SNIPPETS) {
    test(`${sn.category}/${sn.id} AST round-trips`, () => {
      const out = P.astToPython(new P.Parser(new P.Tokenizer(sn.code).tokenize()).parse());
      expect(norm(out)).toBe(norm(sn.code));
    });
  }

  for (const sn of DEMO_SNIPPETS.filter(s => s.execute)) {
    test(`${sn.category}/${sn.id} renders & runs`, async ({ page }) => {
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
      await page.locator('#tab-btn-python').click();
      const toggle = page.locator('#toggle-desugar');
      if (sn.desugar && !(await toggle.isChecked())) await toggle.check();
      if (!sn.desugar && (await toggle.isChecked())) await toggle.uncheck();
      await page.locator('#python-code').fill(sn.code);
      await page.locator('#btn-sync-to-blocks').click();
      await page.waitForTimeout(1000);
      const blocks = await page.evaluate(() =>
        window.Blockly.getMainWorkspace().getAllBlocks().map(b => ({
          type: b.type, text: b.type === 'text' ? b.getFieldValue('TEXT') : null })));
      // no lossy block holding raw source lines
      expect(blocks.some(b => b.text && b.text.includes(' for ') )).toBe(false);
      expect(blocks.some(b => b.type === 'raw_statement')).toBe(false);
      // execute
      await page.locator('#tab-btn-logs').click();
      await page.locator('#btn-run').click();
      await page.waitForFunction(() => {
        const t = document.querySelector('#console-logs')?.textContent || '';
        return t.includes('Execution completed') || t.includes('✅ Python ready') && t.length > 0;
      }, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const logs = await page.locator('#console-logs').textContent();
      expect(logs).not.toContain('[Parser Error]');
      expect(logs).not.toContain('[Runtime Error]');
      for (const want of sn.expectedStdout) expect(logs).toContain(want);
    });
  }
});
```

- [ ] **Step 2: Run the suite**
```bash
npx playwright test tests/examples_roundtrip.spec.js --reporter=line
```
Expected: all AST round-trip tests pass; all `execute:true` render+run tests pass. If any fail, fix the responsible parser path (re-open Tasks 1–6) or, if it is a genuinely missing/ambiguous block, STOP and ask the user.

- [ ] **Step 3: Commit**
```bash
git add tests/examples_roundtrip.spec.js
git commit -m "test: demo snippets round-trip losslessly and execute with expected output"
```

---

## Self-Review

**Spec coverage:** Bug #1→Task1, #2→Task3, #3→Task2, #4→Task4, #5→Task5, #6→Task6; snippet module→Task7; OpenCV→Task8; UI gallery→Task9; automated tests→Task10. All spec sections covered.

**Placeholder scan:** Tasks 4, 5, 6 contain "diagnose and fix" steps without a literal final diff because the exact edit depends on code the executor must read; each is gated by a precise failing test (definition of done) and points at the exact function/line. Acceptable for bug-fix tasks; the test is the contract.

**Type/field consistency:** `subscript_get` inputs OBJECT/KEY (Task1) match its generator (Task1) and its use in `convertExpressionToBlock` (Task1). `subscript_set` inputs OBJECT/KEY/VALUE (Task2) match generator + routing. `DEMO_SNIPPETS` shape (id/title/category/code/expectedStdout/desugar/execute) is identical in Tasks 7, 8, 9, 10.

**Ask-the-user gates:** Tasks 7 (Step 3), 8 (Step 3), 10 (Step 2) each STOP and ask the user if a snippet can't round-trip or a construct has no block — honoring the user's standing directive.
