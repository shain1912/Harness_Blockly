// Demo example snippets for the BlockPy playground.
//
// SINGLE SOURCE OF TRUTH: this same list drives both the in-app "Examples" dropdown
// and the automated round-trip test suite (tests/examples_roundtrip.spec.js), so the
// demo and the tests can never drift. Each snippet is curated to round-trip losslessly
// (Python -> blocks -> Python) and execute with a known output.
//
// Shape: { id, title, category, code, expectedStdout, desugar, execute }
//   expectedStdout : string[] — substrings expected in the console after Run
//   desugar        : boolean  — desired #toggle-desugar state for this snippet
//   execute        : boolean  — false => render/convert-only (e.g. OpenCV)
//
// Follows the project's window-global + module.exports side-effect pattern so Node
// tests can require() it too.

const DEMO_SNIPPETS = [
  // ── Basics ────────────────────────────────────────────────────────────────
  {
    id: 'basics-arith', title: '변수와 산술', category: 'Basics', desugar: true, execute: true,
    code: 'x = 10\ny = 3\nprint(x + y)\nprint(x * y)\nprint(x // y)\nprint(x % y)',
    expectedStdout: ['13', '30', '3', '1'],
  },
  {
    id: 'basics-str', title: '문자열', category: 'Basics', desugar: true, execute: true,
    code: 'name = "BlockPy"\nprint("Hello, " + name + "!")\nprint(name.upper())\nprint(len(name))',
    expectedStdout: ['Hello, BlockPy!', 'BLOCKPY', '7'],
  },

  // ── Data structures ─────────────────────────────────────────────────────────
  {
    id: 'data-list', title: '리스트', category: 'Data', desugar: true, execute: true,
    code: 'nums = [1, 2, 3, 4, 5]\nnums.append(6)\nprint(nums)\nprint(nums[0])\nprint(sum(nums))',
    expectedStdout: ['[1, 2, 3, 4, 5, 6]', '21'],
  },
  {
    id: 'data-dict', title: '딕셔너리', category: 'Data', desugar: true, execute: true,
    code: 'scores = {"alice": 90, "bob": 85}\nscores["carol"] = 95\nprint(scores["alice"])\nprint(len(scores))',
    expectedStdout: ['90', '3'],
  },
  {
    id: 'data-set-tuple', title: '집합과 튜플', category: 'Data', desugar: true, execute: true,
    code: 's = {1, 2, 2, 3}\nprint(len(s))\npoint = (3, 4)\nprint(point[0] + point[1])',
    expectedStdout: ['3', '7'],
  },

  // ── Control flow ──────────────────────────────────────────────────────────
  {
    id: 'ctrl-if', title: '조건문', category: 'Control', desugar: true, execute: true,
    code: 'score = 75\nif score >= 90:\n    print("A")\nelif score >= 70:\n    print("B")\nelse:\n    print("C")',
    expectedStdout: ['B'],
  },
  {
    id: 'ctrl-for', title: '반복문 (for)', category: 'Control', desugar: true, execute: true,
    code: 'total = 0\nfor i in range(1, 6):\n    total = total + i\nprint(total)',
    expectedStdout: ['15'],
  },
  {
    id: 'ctrl-while', title: '반복문 (while)', category: 'Control', desugar: true, execute: true,
    code: 'n = 5\nresult = 1\nwhile n > 0:\n    result = result * n\n    n = n - 1\nprint(result)',
    expectedStdout: ['120'],
  },

  // ── Functions / comprehensions ──────────────────────────────────────────────
  {
    id: 'fn-def', title: '함수', category: 'Functions', desugar: true, execute: true,
    code: 'def square(x):\n    return x * x\nprint(square(5))',
    expectedStdout: ['25'],
  },
  {
    id: 'fn-listcomp', title: '리스트 컴프리헨션', category: 'Functions', desugar: false, execute: true,
    code: 'nums = [1, 2, 3, 4, 5]\nsquares = [n * n for n in nums]\nprint(squares)',
    expectedStdout: ['[1, 4, 9, 16, 25]'],
  },
  {
    id: 'fn-dictcomp', title: '딕셔너리 컴프리헨션', category: 'Functions', desugar: false, execute: true,
    code: 'squares = {n: n * n for n in range(1, 4)}\nprint(squares[3])',
    expectedStdout: ['9'],
  },

  // ── Exceptions / generators ──────────────────────────────────────────────────
  {
    id: 'exc-try', title: '예외 처리', category: 'Exceptions', desugar: true, execute: true,
    code: 'try:\n    x = int("abc")\nexcept ValueError:\n    print("invalid number")\nfinally:\n    print("done")',
    expectedStdout: ['invalid number', 'done'],
  },
  {
    id: 'gen-yield', title: '제너레이터', category: 'Exceptions', desugar: true, execute: true,
    code: 'def countdown(n):\n    while n > 0:\n        yield n\n        n = n - 1\nprint(list(countdown(3)))',
    expectedStdout: ['[3, 2, 1]'],
  },

  // ── Classes ──────────────────────────────────────────────────────────────────
  {
    id: 'cls-basic', title: '클래스', category: 'Classes', desugar: true, execute: true,
    code: 'class Dog:\n    def __init__(self, name):\n        self.name = name\n    def bark(self):\n        return self.name + " says woof"\nd = Dog("Rex")\nprint(d.bark())',
    expectedStdout: ['Rex says woof'],
  },

  // ── OpenCV ───────────────────────────────────────────────────────────────────
  // Uses only the cv2 calls the Pyodide mock implements (imread/cvtColor/imshow/
  // VideoCapture/read/resize), so each runs without error; output is on the canvas,
  // not stdout, so expectedStdout is empty (the test asserts render + no error).
  {
    id: 'cv-gray', title: 'OpenCV: 그레이스케일', category: 'OpenCV', desugar: true, execute: true,
    code: 'import cv2\nimg = cv2.imread("test.jpg")\ngray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\ncv2.imshow("gray", gray)',
    expectedStdout: [],
  },
  {
    // Idiomatic webcam capture loop. Render/convert-only (execute:false): a real
    // `while True` capture loop never terminates headlessly (the cv2 mock's waitKey
    // always returns 0), so it is for showing the block conversion, not running.
    id: 'cv-capture', title: 'OpenCV: 웹캠 캡처 루프', category: 'OpenCV', desugar: true, execute: false,
    code: 'import cv2\ncap = cv2.VideoCapture(0)\nwhile True:\n    ret, frame = cap.read()\n    if not ret:\n        break\n    cv2.imshow("Webcam", frame)\n    if cv2.waitKey(1) == ord("q"):\n        break\ncap.release()\ncv2.destroyAllWindows()',
    expectedStdout: [],
  },
  {
    id: 'cv-resize', title: 'OpenCV: 리사이즈', category: 'OpenCV', desugar: true, execute: true,
    code: 'import cv2\nimg = cv2.imread("photo.png")\nsmall = cv2.resize(img, (320, 240))\ncv2.imshow("resized", small)',
    expectedStdout: [],
  },
];

if (typeof window !== 'undefined') window.BlockPyExamples = DEMO_SNIPPETS;
if (typeof module !== 'undefined') module.exports = { DEMO_SNIPPETS };
