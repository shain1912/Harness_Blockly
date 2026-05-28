// pyodideRunner.js — Real Python execution via Pyodide WebAssembly runtime

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`;
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let _pyodide = null;
let _initPromise = null;
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
const MOCKED = new Set(['cv2','sprite']);

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

# ── cv2 ─────────────────────────────────────────────────────────────────────────
_cv2 = ModuleType('cv2')

class VideoCapture:
    def __init__(self, dev=0):
        self.dev = dev
        js.window._pyodide_cv2('open', str(dev))
    def read(self): return (True, {'type':'frame','dev':self.dev})
    def release(self): js.window._pyodide_cv2('release', str(self.dev))
    def isOpened(self): return True
    def get(self, prop): return 640.0
    def set(self, prop, val): return True

def _imshow(t, f): js.window._pyodide_cv2('imshow', str(t))
def _waitKey(d=0): return 0
def _destroyAllWindows(): js.window._pyodide_cv2('destroyAll', '')
def _destroyWindow(t): js.window._pyodide_cv2('destroy', str(t))
def _imread(p):
    js.window._pyodide_cv2('imread', str(p))
    return {'type':'image','path':p}
def _imwrite(p, img): return True
def _cvtColor(img, code): return img
def _resize(img, dsize): return img

_cv2.VideoCapture = VideoCapture
_cv2.imshow = _imshow
_cv2.waitKey = _waitKey
_cv2.destroyAllWindows = _destroyAllWindows
_cv2.destroyWindow = _destroyWindow
_cv2.imread = _imread
_cv2.imwrite = _imwrite
_cv2.cvtColor = _cvtColor
_cv2.resize = _resize
_cv2.CAP_PROP_FRAME_WIDTH = 3
_cv2.CAP_PROP_FRAME_HEIGHT = 4
_cv2.COLOR_BGR2RGB = 4
_cv2.COLOR_BGR2GRAY = 6
sys.modules['cv2'] = _cv2
import cv2
`;

async function _setupBuiltins(pyodide) {
  await pyodide.runPythonAsync(PYTHON_BUILTINS);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function initPyodide(onStatus) {
  if (_pyodide) return _pyodide;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    onStatus && onStatus('[Pyodide] Downloading Python runtime (~10 MB, one-time)...');
    await _ensurePyodideScript();

    const pyodide = await window.loadPyodide({ indexURL: PYODIDE_INDEX });

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

  return _initPromise;
}

export function interruptPyodide() {
  if (_pyodide?._interruptBuffer) {
    _pyodide._interruptBuffer[0] = 2; // SIGINT
  }
}

export async function runCode(code, callbacks) {
  const { onLog, onSpriteCommand, onCv2Action, onComplete } = callbacks;

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

    const label = PYODIDE_BUILT_IN.has(pkg) ? 'built-in' : 'micropip';
    onLog(`[pip] Loading ${pkg} (${label})...`);
    try {
      await micropip.install(pkg);
      _installedPackages.add(pkg);
      onLog(`[pip] ✅ ${pkg} ready`);
    } catch (e) {
      onLog(`[pip] ⚠️  ${pkg}: ${e.message || e}`);
    }
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
