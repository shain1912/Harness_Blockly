// pyodideRunner.js — Real Python execution via Pyodide WebAssembly runtime

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`;
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let _pyodide = null;
let _initPromise = null;
let _cv2Patched = false;
const _installedPackages = new Set();

// ── Module classification ──────────────────────────────────────────────────────
const STDLIB = new Set([
  'sys','os','math','random','json','time','datetime','collections','re',
  'itertools','functools','pathlib','typing','abc','io','copy','string',
  'struct','hashlib','base64','urllib','http','csv','threading','logging',
  'unittest','traceback','inspect','ast','contextlib','dataclasses','enum',
  'heapq','bisect','array','queue','pprint','textwrap','operator','numbers',
  'decimal','fractions','statistics','cmath','gc','weakref','builtins',
  '__future__','warnings','platform','shutil','glob','tempfile','fnmatch',
]);

// Modules provided by Pyodide's built-in package set (no micropip needed)
const PYODIDE_BUILT_IN = new Set([
  'numpy','pandas','matplotlib','scipy','PIL','Pillow','sklearn','scikit_learn',
  'sympy','statsmodels','seaborn','networkx','lxml','cryptography','cffi',
  'pycparser','attrs','pytest','pyodide',
]);

// Modules we handle ourselves (don't try to install)
const MOCKED = new Set(['sprite']);

// Import name -> PyPI package name. `import cv2` installs the REAL opencv-python wheel
// (works in Pyodide; only its GUI/IO layer is bridged to the browser — see CV2_GUI_PATCH).
const IMPORT_TO_PACKAGE = { cv2: 'opencv-python' };

// ── Script loader ──────────────────────────────────────────────────────────────
async function _ensurePyodideScript() {
  if (window.loadPyodide) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PYODIDE_CDN;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load Pyodide from CDN'));
    document.head.appendChild(s);
  });
}

// ── Python builtins (sprite + cv2) ─────────────────────────────────────────────
const PYTHON_BUILTINS = `
import sys, math, json
import js
from types import ModuleType

# ── sprite ──────────────────────────────────────────────────────────────────────
class _Sprite:
    def __init__(self):
        self._x = 240.0; self._y = 140.0; self._angle = 0.0
        self._pen = False; self._color = '#a855f7'; self._say = None

    def _emit(self, cmd, extra=None):
        s = {'x': float(self._x), 'y': float(self._y),
             'angle': float(self._angle), 'penDown': bool(self._pen),
             'color': str(self._color),
             'sayBubble': str(self._say) if self._say is not None else None}
        if extra:
            s.update(extra)
        js.window._pyodide_sprite(cmd, json.dumps(s))

    def move(self, steps):
        rad = self._angle * math.pi / 180
        ox, oy = self._x, self._y
        self._x += steps * math.cos(rad)
        self._y -= steps * math.sin(rad)
        self._emit('move', {'oldX': float(ox), 'oldY': float(oy),
                             'newX': float(self._x), 'newY': float(self._y)})

    def turn_right(self, a): self._angle = (self._angle - a) % 360; self._emit('turn')
    def turn_left(self, a):  self._angle = (self._angle + a) % 360; self._emit('turn')
    def pen_down(self):  self._pen = True;  self._emit('pen')
    def pen_up(self):    self._pen = False; self._emit('pen')
    def color(self, c):  self._color = str(c); self._emit('color')
    def say(self, t):    self._say = str(t);   self._emit('say')

sprite = _Sprite()

`;

async function _setupBuiltins(pyodide) {
  await pyodide.runPythonAsync(PYTHON_BUILTINS);
}

// Bridges REAL opencv-python's GUI/IO layer to the browser. All processing functions
// (cvtColor, Canny, GaussianBlur, findContours, CascadeClassifier, ...) stay real OpenCV.
//  - imshow: encodes the real ndarray to PNG and hands it to the canvas.
//  - VideoCapture: stubbed (no camera device in Pyodide) so webcam loops exit cleanly.
//  - imread: works on the Pyodide virtual FS; we seed a synthetic sample image into the
//    demo filenames so examples produce real, visible output even before an upload, and
//    uploaded images simply overwrite those files.
const CV2_GUI_PATCH = `
import cv2, base64, os
import numpy as np
import js

def _bp_imshow(winname, mat):
    try:
        arr = np.asarray(mat)
        if arr.dtype != np.uint8:
            arr = cv2.normalize(arr, None, 0, 255, cv2.NORM_MINMAX).astype('uint8')
        ok, buf = cv2.imencode('.png', arr)
        if ok:
            b64 = base64.b64encode(bytes(buf)).decode('ascii')
            js.window._pyodide_cv2_image(str(winname), b64)
    except Exception as e:
        print('[cv2.imshow bridge]', e)

cv2.imshow = _bp_imshow
cv2.waitKey = lambda delay=0: -1
cv2.destroyAllWindows = lambda: js.window._pyodide_cv2('destroyAll', '')
cv2.destroyWindow = lambda w='': js.window._pyodide_cv2('destroy', str(w))

class _BPVideoCapture:
    def __init__(self, *a, **k): pass
    def isOpened(self): return False
    def read(self): return (False, None)
    def release(self): pass
    def get(self, *a): return 0.0
    def set(self, *a): return False
cv2.VideoCapture = _BPVideoCapture

def _bp_make_sample():
    img = np.full((240, 320, 3), 30, dtype=np.uint8)
    cv2.rectangle(img, (40, 50), (150, 170), (0, 0, 255), -1)
    cv2.circle(img, (230, 110), 55, (0, 200, 0), -1)
    cv2.putText(img, 'BlockPy', (30, 215), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    return img
_bp_sample = _bp_make_sample()
for _f in ['input.jpg', 'photo.png', 'test.jpg', 'image.jpg', 'sample.jpg']:
    if not os.path.exists(_f):
        cv2.imwrite(_f, _bp_sample)
`;

// ── Public API ─────────────────────────────────────────────────────────────────

export async function initPyodide(onStatus) {
  if (_pyodide) return _pyodide;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    onStatus && onStatus('[Pyodide] Downloading Python runtime (~10 MB, one-time)...');
    await _ensurePyodideScript();

    const pyodide = await window.loadPyodide({ indexURL: PYODIDE_INDEX });
    // [1.2] Expose the live runtime so the abstraction engine can introspect imported
    // libraries (introspectModule) after a run, enriching their generated blocks.
    if (typeof window !== 'undefined') window.__pyodide = pyodide;

    onStatus && onStatus('[Pyodide] Loading micropip...');
    await pyodide.loadPackage('micropip');

    // Set up interrupt buffer for Stop button (requires SharedArrayBuffer / COOP headers)
    if (typeof SharedArrayBuffer !== 'undefined') {
      const buf = new Uint8Array(new SharedArrayBuffer(1));
      pyodide.setInterruptBuffer(buf);
      pyodide._interruptBuffer = buf;
    }

    onStatus && onStatus('[Pyodide] Setting up sprite & cv2 modules...');
    await _setupBuiltins(pyodide);

    _pyodide = pyodide;
    onStatus && onStatus('[Pyodide] ✅ Python ready!');
    return pyodide;
  })();

  // Expose the init promise so the IR conversion path (pyAstBridge.getPyodide) can await
  // readiness without importing this ES module (it runs as a window-global side-effect file).
  if (typeof window !== 'undefined') window.__pyodideReadyPromise = _initPromise;

  return _initPromise;
}

export function interruptPyodide() {
  if (_pyodide?._interruptBuffer) {
    _pyodide._interruptBuffer[0] = 2; // SIGINT
  }
}

export async function runCode(code, callbacks) {
  const { onLog, onSpriteCommand, onCv2Action, onComplete, onCv2Image } = callbacks;

  // Real cv2.imshow hands us a PNG (base64) of the processed image → show it.
  window._pyodide_cv2_image = (title, b64) => {
    if (onCv2Image) onCv2Image(String(title), `data:image/png;base64,${b64}`);
  };

  // Wire JS callbacks that Python calls via js.window.*
  window._pyodide_sprite = (cmd, stateJson) => {
    try {
      const state = JSON.parse(String(stateJson));
      onSpriteCommand(cmd, state);
    } catch (e) { /* ignore */ }
  };

  window._pyodide_cv2 = (action, payload) => {
    if (!onCv2Action) return;
    const p = String(payload || '');
    switch (action) {
      case 'open':
        onCv2Action('open', { title: `Camera ${p}`, deviceId: Number(p) || 0 });
        break;
      case 'imshow':
        onCv2Action('imshow', { title: p });
        break;
      case 'destroyAll':
        onCv2Action('destroyAll', {});
        break;
      case 'destroy':
        onCv2Action('destroy', { title: p });
        break;
      default:
        break;
    }
  };

  const pyodide = await initPyodide(onLog);

  // Clear interrupt before each run
  if (pyodide._interruptBuffer) pyodide._interruptBuffer[0] = 0;

  // Capture stdout/stderr
  pyodide.setStdout({ batched: (msg) => onLog(msg) });
  pyodide.setStderr({ batched: (msg) => onLog(`[stderr] ${msg}`) });

  // Reset sprite position
  await pyodide.runPythonAsync(
    'sprite._x=240.0; sprite._y=140.0; sprite._angle=0.0; sprite._pen=False; sprite._say=None'
  );

  // Auto-install missing imports
  const micropip = pyodide.pyimport('micropip');
  const detected = _detectImports(code);
  for (const pkg of detected) {
    if (_installedPackages.has(pkg)) continue;
    if (MOCKED.has(pkg) || STDLIB.has(pkg)) continue;

    const installName = IMPORT_TO_PACKAGE[pkg] || pkg;
    const label = PYODIDE_BUILT_IN.has(pkg) ? 'built-in' : 'micropip';
    onLog(`[pip] Loading ${installName} (${label})...`);
    try {
      await micropip.install(installName);
      _installedPackages.add(pkg);
      onLog(`[pip] ✅ ${installName} ready`);
    } catch (e) {
      onLog(`[pip] ⚠️  ${installName}: ${e.message || e}`);
    }
  }

  // Bridge real cv2's GUI/IO layer (imshow/VideoCapture/waitKey) to the browser, once
  // opencv-python is available. All image PROCESSING stays real OpenCV.
  if (_installedPackages.has('cv2') && !_cv2Patched) {
    try { await pyodide.runPythonAsync(CV2_GUI_PATCH); _cv2Patched = true; }
    catch (e) { onLog(`[cv2] GUI bridge failed: ${e.message || e}`); }
  }

  // Execute
  try {
    await pyodide.runPythonAsync(code);
    onComplete && onComplete(null);
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes('KeyboardInterrupt')) {
      onLog('[Pyodide] Execution stopped.');
    } else {
      onLog(`[Runtime Error] ${msg}`);
    }
    onComplete && onComplete(e);
  }
}

export async function pipInstall(packageName, onLog) {
  const pyodide = await initPyodide(onLog);
  onLog(`[pip] Installing ${packageName}...`);
  try {
    const micropip = pyodide.pyimport('micropip');
    await micropip.install(packageName);
    _installedPackages.add(packageName);
    onLog(`[pip] ✅ ${packageName} ready`);
    return true;
  } catch (e) {
    onLog(`[pip] ❌ ${packageName}: ${e.message || e}`);
    return false;
  }
}

export function getInstalledPackages() {
  return [..._installedPackages];
}

// Returns true once Pyodide is initialized AND opencv-python is installed + bridged.
export function isEnvironmentReady() {
  return !!_pyodide && _installedPackages.has('cv2') && _cv2Patched;
}

// Pre-warm the environment in the background so the FIRST Run is instant: initialize
// Pyodide, install the real opencv-python wheel, apply the cv2 GUI bridge, and seed the
// sample images. Idempotent — reuses the already-built environment on later calls and
// across runs in the same session (only a page reload rebuilds it).
let _prewarmPromise = null;
export function prewarmEnvironment(onStatus) {
  if (_prewarmPromise) return _prewarmPromise;
  _prewarmPromise = (async () => {
    const pyodide = await initPyodide(onStatus || (() => {}));
    if (!_installedPackages.has('cv2')) {
      try {
        onStatus && onStatus('[pip] Loading opencv-python (one-time)...');
        const micropip = pyodide.pyimport('micropip');
        await micropip.install('opencv-python');
        _installedPackages.add('cv2');
        onStatus && onStatus('[pip] ✅ opencv-python ready');
      } catch (e) {
        onStatus && onStatus(`[pip] ⚠️ opencv-python: ${e.message || e}`);
      }
    }
    if (_installedPackages.has('cv2') && !_cv2Patched) {
      try { await pyodide.runPythonAsync(CV2_GUI_PATCH); _cv2Patched = true; }
      catch (e) { onStatus && onStatus(`[cv2] GUI bridge failed: ${e.message || e}`); }
    }
    return pyodide;
  })();
  return _prewarmPromise;
}

// Write an uploaded image into Pyodide's virtual filesystem so real cv2.imread(name)
// reads it. Also overwrites the demo sample filenames so existing examples pick it up.
export async function writeImageToFS(filename, uint8) {
  const pyodide = await initPyodide(() => {});
  const data = uint8 instanceof Uint8Array ? uint8 : new Uint8Array(uint8);
  const targets = new Set([filename, 'input.jpg', 'photo.png', 'test.jpg', 'image.jpg', 'sample.jpg']);
  for (const name of targets) {
    try { pyodide.FS.writeFile(name, data); } catch (_) { /* ignore */ }
  }
  return true;
}

function _detectImports(code) {
  const pkgs = new Set();
  for (const line of code.split('\n')) {
    const t = line.trim();
    const m1 = t.match(/^import\s+([\w.]+)/);
    const m2 = t.match(/^from\s+([\w.]+)\s+import/);
    if (m1) pkgs.add(m1[1].split('.')[0]);
    if (m2) pkgs.add(m2[1].split('.')[0]);
  }
  return [...pkgs];
}

function _shouldInstall(pkg) {
  return !STDLIB.has(pkg) && !PYODIDE_BUILT_IN.has(pkg) && !MOCKED.has(pkg);
}
