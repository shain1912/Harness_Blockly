// Demo example snippets for the BlockPy playground.
//
// SINGLE SOURCE OF TRUTH: this same list drives both the in-app "Examples" dropdown
// and the automated round-trip test suite (tests/examples_roundtrip.spec.js), so the
// demo and the tests can never drift. Each snippet is curated to round-trip losslessly
// (Python -> blocks -> Python) and execute with a known output.
//
// Shape: { id, title, category, code, expectedStdout, desugar, execute, canonical? }
//   expectedStdout : string[] — substrings expected in the console after Run
//   desugar        : boolean  — desired #toggle-desugar state for this snippet
//   execute        : boolean  — false => render/convert-only (e.g. OpenCV)
//   canonical      : string?  — for constructs that normalize on round-trip (semicolon
//                               splits to newlines, `\` continuation joins lines), the
//                               exact Python the round-trip must produce. Omit when the
//                               snippet round-trips byte-for-byte.
//
// Follows the project's window-global + module.exports side-effect pattern so Node
// tests can require() it too.

const DEMO_SNIPPETS = [
  // ── Basics ────────────────────────────────────────────────────────────────
  {
    id: 'basics-arith', title: 'Variables & Arithmetic', category: 'Basics', desugar: true, execute: true,
    code: 'x = 10\ny = 3\nprint(x + y)\nprint(x * y)\nprint(x // y)\nprint(x % y)',
    expectedStdout: ['13', '30', '3', '1'],
  },
  {
    id: 'basics-str', title: 'Strings', category: 'Basics', desugar: true, execute: true,
    code: 'name = "BlockPy"\nprint("Hello, " + name + "!")\nprint(name.upper())\nprint(len(name))',
    expectedStdout: ['Hello, BlockPy!', 'BLOCKPY', '7'],
  },

  // ── Data structures ─────────────────────────────────────────────────────────
  {
    id: 'data-list', title: 'Lists', category: 'Data', desugar: true, execute: true,
    code: 'nums = [1, 2, 3, 4, 5]\nnums.append(6)\nprint(nums)\nprint(nums[0])\nprint(sum(nums))',
    expectedStdout: ['[1, 2, 3, 4, 5, 6]', '21'],
  },
  {
    id: 'data-dict', title: 'Dictionaries', category: 'Data', desugar: true, execute: true,
    code: 'scores = {"alice": 90, "bob": 85}\nscores["carol"] = 95\nprint(scores["alice"])\nprint(len(scores))',
    expectedStdout: ['90', '3'],
  },
  {
    id: 'data-set-tuple', title: 'Sets & Tuples', category: 'Data', desugar: true, execute: true,
    code: 's = {1, 2, 2, 3}\nprint(len(s))\npoint = (3, 4)\nprint(point[0] + point[1])',
    expectedStdout: ['3', '7'],
  },

  // ── Control flow ──────────────────────────────────────────────────────────
  {
    id: 'ctrl-if', title: 'Conditionals', category: 'Control', desugar: true, execute: true,
    code: 'score = 75\nif score >= 90:\n    print("A")\nelif score >= 70:\n    print("B")\nelse:\n    print("C")',
    expectedStdout: ['B'],
  },
  {
    id: 'ctrl-for', title: 'Loops (for)', category: 'Control', desugar: true, execute: true,
    code: 'total = 0\nfor i in range(1, 6):\n    total = total + i\nprint(total)',
    expectedStdout: ['15'],
  },
  {
    id: 'ctrl-while', title: 'Loops (while)', category: 'Control', desugar: true, execute: true,
    code: 'n = 5\nresult = 1\nwhile n > 0:\n    result = result * n\n    n = n - 1\nprint(result)',
    expectedStdout: ['120'],
  },

  // ── Functions / comprehensions ──────────────────────────────────────────────
  {
    id: 'fn-def', title: 'Functions', category: 'Functions', desugar: true, execute: true,
    code: 'def square(x):\n    return x * x\nprint(square(5))',
    expectedStdout: ['25'],
  },
  {
    id: 'fn-listcomp', title: 'List Comprehension', category: 'Functions', desugar: false, execute: true,
    code: 'nums = [1, 2, 3, 4, 5]\nsquares = [n * n for n in nums]\nprint(squares)',
    expectedStdout: ['[1, 4, 9, 16, 25]'],
  },
  {
    id: 'fn-dictcomp', title: 'Dict Comprehension', category: 'Functions', desugar: false, execute: true,
    code: 'squares = {n: n * n for n in range(1, 4)}\nprint(squares[3])',
    expectedStdout: ['9'],
  },

  // ── Exceptions / generators ──────────────────────────────────────────────────
  {
    id: 'exc-try', title: 'Exception Handling', category: 'Exceptions', desugar: true, execute: true,
    code: 'try:\n    x = int("abc")\nexcept ValueError:\n    print("invalid number")\nfinally:\n    print("done")',
    expectedStdout: ['invalid number', 'done'],
  },
  {
    id: 'gen-yield', title: 'Generators', category: 'Exceptions', desugar: true, execute: true,
    code: 'def countdown(n):\n    while n > 0:\n        yield n\n        n = n - 1\nprint(list(countdown(3)))',
    expectedStdout: ['[3, 2, 1]'],
  },

  // ── Classes ──────────────────────────────────────────────────────────────────
  {
    id: 'cls-basic', title: 'Classes', category: 'Classes', desugar: true, execute: true,
    code: 'class Dog:\n    def __init__(self, name):\n        self.name = name\n    def bark(self):\n        return self.name + " says woof"\nd = Dog("Rex")\nprint(d.bark())',
    expectedStdout: ['Rex says woof'],
  },

  // ── OpenCV ───────────────────────────────────────────────────────────────────
  // Uses only the cv2 calls the Pyodide mock implements (imread/cvtColor/imshow/
  // VideoCapture/read/resize), so each runs without error; output is on the canvas,
  // not stdout, so expectedStdout is empty (the test asserts render + no error).
  {
    id: 'cv-gray', title: 'OpenCV: Grayscale', category: 'OpenCV', desugar: true, execute: true,
    code: 'import cv2\nimg = cv2.imread("test.jpg")\ngray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\ncv2.imshow("gray", gray)\ncv2.waitKey(1000)\ncv2.destroyAllWindows()',
    expectedStdout: [],
  },
  {
    // Idiomatic webcam capture loop. Render/convert-only (execute:false): a real
    // `while True` capture loop never terminates headlessly (the cv2 mock's waitKey
    // always returns 0), so it is for showing the block conversion, not running.
    id: 'cv-capture', title: 'OpenCV: Webcam Capture Loop', category: 'OpenCV', desugar: true, execute: false,
    code: 'import cv2\ncap = cv2.VideoCapture(0)\nwhile True:\n    ret, frame = cap.read()\n    if not ret:\n        break\n    cv2.imshow("Webcam", frame)\n    if cv2.waitKey(1) == ord("q"):\n        break\ncap.release()\ncv2.destroyAllWindows()',
    expectedStdout: [],
  },
  {
    id: 'cv-resize', title: 'OpenCV: Resize', category: 'OpenCV', desugar: true, execute: true,
    code: 'import cv2\nimg = cv2.imread("photo.png")\nsmall = cv2.resize(img, (320, 240))\ncv2.imshow("resized", small)',
    expectedStdout: [],
  },
  {
    // Realistic edge + contour pipeline. Render/convert-only: GaussianBlur/Canny/
    // findContours aren't in the cv2 mock, so this is for showing the block conversion.
    id: 'cv-contours', title: 'OpenCV: Edges & Contours', category: 'OpenCV', desugar: true, execute: false,
    code: 'import cv2\nimg = cv2.imread("input.jpg")\ngray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\nblurred = cv2.GaussianBlur(gray, (5, 5), 0)\nedges = cv2.Canny(blurred, 50, 150)\ncontours, hierarchy = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)\ncv2.drawContours(img, contours, -1, (0, 255, 0), 2)\ncv2.imshow("Contours", img)\ncv2.waitKey(0)\ncv2.destroyAllWindows()',
    expectedStdout: [],
  },
  {
    // Webcam face recognition via a Haar cascade. Render/convert-only (infinite capture
    // loop; CascadeClassifier/detectMultiScale aren't in the cv2 mock).
    id: 'cv-face', title: 'OpenCV: Webcam Face Detection', category: 'OpenCV', desugar: true, execute: false,
    code: 'import cv2\nface_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")\ncap = cv2.VideoCapture(0)\nwhile True:\n    ret, frame = cap.read()\n    if not ret:\n        break\n    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)\n    faces = face_cascade.detectMultiScale(gray, 1.1, 4)\n    for (x, y, w, h) in faces:\n        cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 0, 0), 2)\n    cv2.imshow("Face Detection", frame)\n    if cv2.waitKey(1) & 0xFF == ord("q"):\n        break\ncap.release()\ncv2.destroyAllWindows()',
    expectedStdout: [],
  },

  // ── Type Hints & Syntax (added 2026-06-06: W7/W8/W9) ─────────────────────────
  // Each prints a result so Run shows visible output. desugar:true — none of these
  // contain desugarable constructs (comprehension/ternary/chained-comparison) so the
  // desugar pass is a no-op; true matches the default toggle state.
  {
    id: 'ann-vars', title: 'Annotated Variables', category: 'Type Hints & Syntax', desugar: true, execute: true,
    code: 'count: int = 0\nnames: list[str] = ["a", "b"]\ncount = count + len(names)\nprint(count)',
    expectedStdout: ['2'],
  },
  {
    id: 'ann-return', title: 'Return Annotation', category: 'Type Hints & Syntax', desugar: true, execute: true,
    code: 'def add(a: int, b: int) -> int:\n    return a + b\nresult: int = add(3, 4)\nprint(result)',
    expectedStdout: ['7'],
  },
  {
    id: 'ann-attr', title: 'Annotated Attribute (in __init__)', category: 'Type Hints & Syntax', desugar: true, execute: true,
    code: 'class Box:\n    def __init__(self, w: float, h: float) -> None:\n        self.area: float = w * h\nb = Box(3.0, 4.0)\nprint(b.area)',
    expectedStdout: ['12.0'],
  },
  {
    id: 'syntax-range', title: 'range() as a Value', category: 'Type Hints & Syntax', desugar: true, execute: true,
    code: 'r = list(range(2, 10, 2))\nprint(r)',
    expectedStdout: ['[2, 4, 6, 8]'],
  },
  {
    id: 'syntax-ellipsis', title: 'Ellipsis ...', category: 'Type Hints & Syntax', desugar: true, execute: true,
    code: 'placeholder = ...\nprint(placeholder is Ellipsis)',
    expectedStdout: ['True'],
  },
  {
    id: 'ann-subscript', title: 'Annotated Subscript Target', category: 'Type Hints & Syntax', desugar: true, execute: true,
    code: 'matrix = [[0, 0], [0, 0]]\nmatrix[0]: list = [1, 2]\nprint(matrix)',
    expectedStdout: ['[[1, 2], [0, 0]]'],
  },
  {
    // Normalizes: a semicolon has no Blockly syntax, so each simple statement becomes
    // its own block and the round-trip re-emits them on separate lines.
    id: 'syntax-semicolon', title: 'Semicolon Statements', category: 'Type Hints & Syntax', desugar: true, execute: true,
    code: 'a = 1; b = 2; c = 3\nprint(a + b + c)',
    canonical: 'a = 1\nb = 2\nc = 3\nprint(a + b + c)',
    expectedStdout: ['6'],
  },
  {
    // Normalizes: a `\` line continuation joins the physical lines into one statement,
    // which the round-trip re-emits as a single line.
    id: 'syntax-continuation', title: 'Line Continuation \\', category: 'Type Hints & Syntax', desugar: true, execute: true,
    code: 'total = 1 + 2 + \\\n        3 + 4\nprint(total)',
    canonical: 'total = 1 + 2 + 3 + 4\nprint(total)',
    expectedStdout: ['10'],
  },

  // ── Libraries (unseen, pip-installed) ────────────────────────────────────────
  // Demonstrates: micropip-install + automatic block conversion + run for a library
  // BlockPy has no preset for. humanize is pure-Python and installs in Pyodide.
  {
    id: 'lib-humanize', title: 'Unseen Library: humanize', category: 'Libraries', desugar: true, execute: true,
    code: 'import humanize\nprint(humanize.intcomma(1234567))\nprint(humanize.ordinal(21))\nprint(humanize.naturalsize(1048576))',
    expectedStdout: ['1,234,567', '21st', '1.0 MB'],
  },
];

if (typeof window !== 'undefined') window.BlockPyExamples = DEMO_SNIPPETS;
if (typeof module !== 'undefined') module.exports = { DEMO_SNIPPETS };
