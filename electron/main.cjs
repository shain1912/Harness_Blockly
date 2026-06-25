// Electron main process — BlockPy desktop (offline-capable) shell.
//
// Boots the embedded Express backend (server.js) on a free localhost port, then opens a
// BrowserWindow pointed at it. Loading over http://127.0.0.1 (not file://) is deliberate:
//   1. the renderer hits /api on the SAME origin (no CORS, no CDN), and
//   2. Express sends COOP/COEP so SharedArrayBuffer / Pyodide work (cross-origin isolation).
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');

// Tell the embedded server to host the built frontend. MUST be set before requiring
// server.js — it reads BLOCKPY_STATIC_DIR at module-load to register static middleware.
process.env.BLOCKPY_STATIC_DIR = DIST_DIR;
// Quiet the "no AI keys" path by default; .env (if present next to server.js) still wins.
process.env.PYTHONIOENCODING = process.env.PYTHONIOENCODING || 'utf-8';

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
