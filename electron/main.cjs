// Electron main process — BlockPy desktop (offline-capable) shell.
//
// Boots the embedded Express backend (server.js) on a free localhost port, then opens a
// BrowserWindow pointed at it. Loading over http://127.0.0.1 (not file://) is deliberate:
//   1. the renderer hits /api on the SAME origin (no CORS, no CDN), and
//   2. Express sends COOP/COEP so SharedArrayBuffer / Pyodide work (cross-origin isolation).
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const ICON_PNG = path.join(__dirname, '..', 'build', 'icon.png');

// Tell the embedded server to host the built frontend. MUST be set before requiring
// server.js — it reads BLOCKPY_STATIC_DIR at module-load to register static middleware.
process.env.BLOCKPY_STATIC_DIR = DIST_DIR;
// Quiet the "no AI keys" path by default; .env (if present next to server.js) still wins.
process.env.PYTHONIOENCODING = process.env.PYTHONIOENCODING || 'utf-8';

// Prefer the bundled portable Python (real cv2/numpy/pillow) so the app runs real Python with
// NO system install. Packaged: resources/python/python.exe (electron-builder extraResources).
// Dev: ./python-embed/python.exe if built. Falls back to system python when neither exists.
// Set before requiring server.js, which reads PYTHON_CMD at module-load.
const BUNDLED_PY = app.isPackaged
  ? path.join(process.resourcesPath, 'python', 'python.exe')
  : path.join(__dirname, '..', 'python-embed', 'python.exe');
if (fs.existsSync(BUNDLED_PY)) {
  process.env.PYTHON_CMD = BUNDLED_PY;
  console.log('[python] using bundled runtime:', BUNDLED_PY);
} else if (!process.env.PYTHON_CMD) {
  console.log('[python] bundled runtime not found — falling back to system python');
}

// AI key config (option A): the in-app Settings panel saves the MiniMax key to a per-machine,
// per-user file — NOT bundled into the .exe (a shipped binary carries zero keys). Also read an
// optional pre-seed file placed next to the executable, so a machine can be configured without UI.
// Both set before requiring server.js, which reads them at module-load.
if (!process.env.BLOCKPY_CONFIG) {
  process.env.BLOCKPY_CONFIG = path.join(app.getPath('userData'), 'blockpy-config.json');
}
if (!process.env.BLOCKPY_CONFIG_RO) {
  process.env.BLOCKPY_CONFIG_RO = path.join(path.dirname(process.execPath), 'blockpy-config.json');
}
console.log('[ai] key config:', process.env.BLOCKPY_CONFIG);

const { start } = require('../server.js');

let mainWindow = null;
let serverInfo = null;

async function createWindow() {
  // Port 0 → OS assigns a free port; server.address().port reports the real one.
  serverInfo = await start(0);
  const url = `http://127.0.0.1:${serverInfo.port}`;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1f1d1a',
    title: 'BlockPy',
    // Dev: window/taskbar icon. Packaged: the exe icon (build/icon.ico, baked by
    // electron-builder) is used automatically, so this guard just no-ops there.
    ...(fs.existsSync(ICON_PNG) ? { icon: ICON_PNG } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer is a normal web page talking to localhost over fetch — it needs no
      // Node access, so we keep the secure defaults (no preload bridge required).
    },
  });

  // Open external links (docs, etc.) in the system browser, not inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target) && !target.startsWith(url)) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  await mainWindow.loadURL(url);

  if (process.env.BLOCKPY_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow).catch((err) => {
  console.error('[electron] failed to start:', err);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  // The embedded Express child dies with the process; standard quit on all platforms but mac.
  if (process.platform !== 'darwin') app.quit();
});
