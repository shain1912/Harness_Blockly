import React, { useState, useEffect, useRef } from 'react';
import BlocklyEditor from './components/BlocklyEditor';
import PythonEditor from './components/PythonEditor';
import Stage from './components/Stage';
import ConsoleLogs from './components/ConsoleLogs';
import VariableWatch from './components/VariableWatch';
import ASTTreeView from './components/ASTTreeView';
import LibraryManager from './components/LibraryManager';
import { runCode, initPyodide, interruptPyodide, pipInstall, writeImageToFS, prewarmEnvironment, isEnvironmentReady } from './utils/pyodideRunner';

export default function App() {
  const [code, setCode] = useState('');
  const [logs, setLogs] = useState([]);
  const [variables, setVariables] = useState({});
  const [spriteState, setSpriteState] = useState({
    x: 240,
    y: 140,
    angle: 0,
    penDown: false,
    color: '#a855f7',
    sayBubble: null
  });
  const [drawnLines, setDrawnLines] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState(null);
  
  // OpenCV image output (from real cv2.imshow) + uploaded image name
  const [cv2Images, setCv2Images] = useState([]);
  const [uploadedImageName, setUploadedImageName] = useState(null);
  const [uploadedMedia, setUploadedMedia] = useState([]); // thumbnails of uploaded media, shown under the Stage

  // Gray (raw_statement/raw_expression) blocks — parts that didn't map to a dedicated block.
  const [grayBlocks, setGrayBlocks] = useState([]);

  // Custom Abstract blocks and thoughts
  const [installedBlocks, setInstalledBlocks] = useState([]);
  const [aiThoughts, setAiThoughts] = useState([]);
  const [isAbstracting, setIsAbstracting] = useState(false);

  // Pyodide state
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);

  // Synced status state
  const [syntaxStatus, setSyntaxStatus] = useState({ valid: true, error: '' });
  // Phase 4: desugar-as-feature is OPT-IN. Default OFF -> Convert preserves SUGAR blocks (the
  // "intended coexistence" IR behavior); ON rewrites sugar to elementary loop/conditional blocks.
  const [shouldDesugar, setShouldDesugar] = useState(false);
  // Phase 4 slice 4: the Desugared preview pane shows the REAL IR desugar (computed async).
  const [desugaredPreview, setDesugaredPreview] = useState('');

  // Tabs layout variables
  const [activeEditorTab, setActiveEditorTab] = useState('blockly');
  const [activeAuxTab, setActiveAuxTab] = useState('stage');
  const [isDarkTheme, setIsDarkTheme] = useState(false); // default = Claude cream (light)

  // Synchronization refs
  const workspaceRef = useRef(null);
  // Counter (not boolean): a code->block sync increments on entry / decrements on exit, so the
  // block->code listener stays suppressed until ALL concurrent syncs finish (BlocklyEditor reads it
  // for truthiness: 0 = idle, >0 = syncing). Guards rapid Auto-Desugar toggles racing each other.
  const isSyncingFromCodeRef = useRef(0);
  const syncGenRef = useRef(0);   // monotonic id; only the LATEST sync's workspace load is applied
  const blocklySnapshotRef = useRef(null);
  const associatedPythonRef = useRef('');
  const abstractionEngineRef = useRef(null);
  const shellAbortRef = useRef(null);
  const desugarToggleMountRef = useRef(true);   // skip the toggle re-Convert on initial mount

  // Structural script equivalence helper
  const arePythonScriptsEquivalent = (codeA, codeB) => {
    const clean = (c) => c.replace(/#.*$/gm, '')
                          .replace(/\s+/g, ' ')
                          .trim();
    return clean(codeA) === clean(codeB);
  };

  // Compile Python to Blockly blocks via the CPython-3.12 ast single-IR pipeline (Pyodide):
  //   python -> pythonToIR -> irToBlockly -> Blockly workspace load.
  // Async because the parse runs in Pyodide. The legacy BlockPyParser/Desugarer path is retired
  // from conversion; IR keeps SUGAR blocks (no desugar — desugar-as-feature is a later phase).
  const syncCodeToBlocks = async (currentCode) => {
    if (!currentCode.trim() || currentCode.startsWith('# Start dragging')) return;
    if (!workspaceRef.current) return;

    isSyncingFromCodeRef.current += 1;
    const myGen = ++syncGenRef.current;

    try {
      // Snapshot Recovery Check: unchanged Python since the last block edit restores the saved
      // workspace JSON verbatim (no re-parse, no block drift).
      if (blocklySnapshotRef.current && arePythonScriptsEquivalent(currentCode, associatedPythonRef.current)) {
        window.Blockly.serialization.workspaces.load(blocklySnapshotRef.current, workspaceRef.current);
        setLogs(prev => [...prev, '[Sync-Engine] Python matches active snapshot. Restored layout without block drift.']);
        setSyntaxStatus({ valid: true, error: '' });
        return;
      }

      const pyodide = await window.BlockPyAstBridge.getPyodide();
      let ir = await window.BlockPyAstBridge.pythonToIR(pyodide, currentCode);
      // Phase 4 (opt-in): rewrite sugar (comprehensions/ternary/chained compare) to elementary
      // loop/conditional/boolean IR in provably-safe positions; SUGAR is preserved elsewhere. The
      // pass emits only existing IR nodes, so irToBlockly consumes it unchanged.
      if (shouldDesugar && window.BlockPyIrDesugar) {
        ir = window.BlockPyIrDesugar.desugarIr(ir);
      }
      const blocklyJson = window.BlockPyIR.irToBlockly(ir);
      // If a newer sync started while we awaited Pyodide/parse (e.g. a quick second Auto-Desugar
      // toggle), discard this stale result so the workspace always reflects the LATEST request.
      if (myGen !== syncGenRef.current) return;
      window.Blockly.serialization.workspaces.load(blocklyJson, workspaceRef.current);

      // Ensure the freshly-loaded blocks actually render and are in view. Loading into a
      // hidden/zero-size workspace (e.g. while the Python tab is active) leaves blocks
      // unrendered until a resize, and tall stacks can land off-screen — both look like
      // "convert produced no blocks". Resize + center fixes it.
      try {
        window.Blockly.svgResize(workspaceRef.current);
        if (typeof workspaceRef.current.scrollCenter === 'function') workspaceRef.current.scrollCenter();
      } catch (_) { /* non-fatal */ }

      blocklySnapshotRef.current = window.Blockly.serialization.workspaces.save(workspaceRef.current);
      associatedPythonRef.current = currentCode;
      refreshGrayBlocks(); // update the gray (unconverted) block inspector

      setLogs(prev => [...prev, '[Sync-Engine] Converted Python → blocks via CPython-3.12 ast IR.']);
      setSyntaxStatus({ valid: true, error: '' });
    } catch (err) {
      console.error(err);
      setLogs(prev => [...prev, `[Parser Error] ${err.message}`]);
      setSyntaxStatus({ valid: false, error: err.message });
    } finally {
      isSyncingFromCodeRef.current -= 1;
    }
  };

  // cv2 popup window manager
  const cv2WindowsRef = useRef({});

  const openCv2Window = (title) => {
    if (cv2WindowsRef.current[title] && !cv2WindowsRef.current[title].closed) {
      return cv2WindowsRef.current[title];
    }
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>cv2 — ${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; display: flex; flex-direction: column; font-family: monospace; }
    #bar { background: #1a1a1a; color: #4ade80; padding: 4px 10px; font-size: 11px;
           border-bottom: 1px solid #333; display: flex; align-items: center; gap: 8px; }
    #bar span { color: #94a3b8; }
    canvas { display: block; width: 100%; }
    #err { color: #f87171; padding: 16px; font-size: 13px; display: none; }
  </style>
</head>
<body>
  <div id="bar">cv2.imshow <span>"${title}"</span></div>
  <video id="v" autoplay playsinline muted style="display:none"></video>
  <canvas id="c"></canvas>
  <div id="err"></div>
  <script>
    const v = document.getElementById('v');
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    const err = document.getElementById('err');

    navigator.mediaDevices.getUserMedia({ video: { width:640, height:480 }, audio: false })
      .then(stream => {
        v.srcObject = stream;
        v.onloadedmetadata = () => {
          c.width = v.videoWidth || 640;
          c.height = v.videoHeight || 480;
          (function draw() {
            ctx.drawImage(v, 0, 0, c.width, c.height);
            requestAnimationFrame(draw);
          })();
        };
      })
      .catch(e => {
        c.width = 640; c.height = 360;
        ctx.fillStyle = '#111'; ctx.fillRect(0,0,640,360);
        ctx.fillStyle = '#4ade80'; ctx.font = 'bold 18px monospace';
        ctx.fillText('Camera: ' + e.message, 20, 180);
        ctx.fillStyle = '#94a3b8'; ctx.font = '13px monospace';
        ctx.fillText('(Allow camera permission and reload)', 20, 210);
      });
  </script>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, `cv2_${title}`, 'width=660,height=520,toolbar=no,menubar=no,resizable=yes');
    cv2WindowsRef.current[title] = win;
    return win;
  };

  const handleCv2Action = (action, payload) => {
    switch (action) {
      case 'open':
        openCv2Window(payload.title || `Camera ${payload.deviceId}`);
        break;
      case 'imshow':
        openCv2Window(payload.title || 'cv2');
        break;
      case 'destroyAll':
        Object.values(cv2WindowsRef.current).forEach(w => { if (w && !w.closed) w.close(); });
        cv2WindowsRef.current = {};
        break;
      case 'destroy':
        if (cv2WindowsRef.current[payload.title]) {
          cv2WindowsRef.current[payload.title].close();
          delete cv2WindowsRef.current[payload.title];
        }
        break;
      default:
        break;
    }
  };

  // Register the built-in cv2 palette and restore any user-generated libraries — both through the
  // Phase 5 registry (BlockPyLibRegistry), the single source of truth, so they appear in the Library
  // toolbox category and lower correctly. The cv2 preload is in-memory only (re-registered each
  // mount); localStorage/hydrate is reserved for user-generated libraries. A single setInstalledBlocks
  // here (union, deduped by type) avoids the two-effects clobber.
  useEffect(() => {
    // Persistent abstraction engine — kept on window for the legacy parser handle (window.__blockpyEngine).
    const engine = new window.BlockPyAbstraction.LibraryAbstractionEngine(null);
    abstractionEngineRef.current = engine;
    window.__blockpyEngine = engine;

    const reg = window.BlockPyLibRegistry;
    const installed = [];
    if (reg) {
      // Restore user-generated libraries from localStorage (re-registers their Blockly.Blocks defs).
      const restored = (typeof reg.hydrate === 'function') ? reg.hydrate() : [];
      if (Array.isArray(restored)) installed.push(...restored);
      // Register the built-in cv2 palette (idempotent; in-memory, not persisted).
      const cv2Preset = window.BlockPyAbstraction.AI_PRESETS['cv2'];
      if (cv2Preset) {
        cv2Preset.blocks.forEach((b) => {
          const spec = reg.specFromDescriptor(b, 'cv2');
          const res = reg.registerLibBlock({ ...spec, builtin: true });
          if (res.ok && !installed.some((e) => e.type === res.type)) {
            const stored = reg.getLibSpec(res.type) || spec;
            installed.push({ type: res.type, title: stored.title, hasOutput: stored.hasOutput, func: stored.func, args: stored.argNames || stored.args, colour: stored.colour });
          }
        });
      }
      setInstalledBlocks(installed);
    }

    // Load initial glowing star demo script
    loadDemoScript('star');
  }, []);

  // Pre-warm the Python environment (Pyodide + real opencv-python + sample images) in the
  // background as soon as the app loads, so the first Run is instant rather than waiting
  // for a one-time download/install. Within a session this is built once and reused.
  useEffect(() => {
    let cancelled = false;
    setPyodideLoading(true);
    prewarmEnvironment((msg) => { if (!cancelled) setLogs((prev) => [...prev, msg]); })
      .then(() => { if (!cancelled) { setPyodideLoading(false); setPyodideReady(true); } })
      .catch(() => { if (!cancelled) setPyodideLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // When the Blockly tab becomes visible, force a resize + recenter. Blockly cannot lay
  // out blocks while its container is display:none, so blocks converted on the Python tab
  // would otherwise appear missing until the user nudges the canvas.
  useEffect(() => {
    if (activeEditorTab === 'blockly' && workspaceRef.current && window.Blockly) {
      requestAnimationFrame(() => {
        try {
          window.Blockly.svgResize(workspaceRef.current);
          if (typeof workspaceRef.current.scrollCenter === 'function') workspaceRef.current.scrollCenter();
        } catch (_) { /* non-fatal */ }
      });
    }
  }, [activeEditorTab]);

  // Dynamic-library palette (Phase 5): when the registry changes (hydrate on mount, or a new
  // AI/preset registration), rebuild the JSON toolbox so the "Library" category reflects the
  // live registry. Blockly diffs categoryToolbox JSON on updateToolbox(). Children-first effect
  // ordering means BlocklyEditor has already injected (workspaceRef set) before this runs.
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws || typeof window.BlockPyBuildIrToolbox !== 'function') return;
    try {
      ws.updateToolbox(window.BlockPyBuildIrToolbox());
    } catch (e) {
      console.error('Failed to refresh library toolbox:', e);
    }
  }, [installedBlocks]);

  // Phase 4: toggling "Auto Desugar" must re-Convert the current code so the blocks immediately
  // reflect the new setting. The saved snapshot was captured under the OLD setting, so invalidate
  // it first — otherwise snapshot recovery (unchanged Python) would restore the old-setting blocks.
  useEffect(() => {
    if (desugarToggleMountRef.current) { desugarToggleMountRef.current = false; return; }
    blocklySnapshotRef.current = null;
    if (code && code.trim()) syncCodeToBlocks(code);
    // Intentionally keyed on shouldDesugar only; reads the current code/closure at toggle time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldDesugar]);

  // Phase 4 slice 4: keep the Desugared preview pane in sync with the REAL IR desugar pass
  // (pythonToIR -> desugarIr -> irToPython), so the preview matches what "Auto Desugar" produces
  // in blocks. Computed only while the Desugared tab is active (Pyodide round-trip is async).
  useEffect(() => {
    if (activeEditorTab !== 'desugar') return;
    let cancelled = false;
    (async () => {
      if (!code || !code.trim()) { if (!cancelled) setDesugaredPreview(''); return; }
      try {
        const py = await window.BlockPyAstBridge.getPyodide();
        const ir = await window.BlockPyAstBridge.pythonToIR(py, code);
        const dir = window.BlockPyIrDesugar.desugarIr(ir);
        const out = await window.BlockPyAstBridge.irToPython(py, dir);
        if (!cancelled) setDesugaredPreview(out.replace(/\n$/, ''));
      } catch (e) {
        if (!cancelled) setDesugaredPreview('# (desugar preview unavailable: ' + (e.message || e) + ')');
      }
    })();
    return () => { cancelled = true; };
  }, [code, activeEditorTab]);

  const loadDemoScript = (type) => {
    let demoCode = '';
    switch (type) {
      case 'opencv':
        demoCode = `# OpenCV Webcam Stream — opens a real camera window
cap = cv2.VideoCapture(0)
print("Camera opened. Streaming...")
frame = cap.read()
cv2.imshow("Live Webcam", frame)
key = cv2.waitKey(1)
print("Press Stop to close the webcam window.")
cv2.destroyAllWindows()`;
        break;
      case 'star':
        demoCode = `# Drawing a Glowing Vector Star using Loops and Pen
sprite.pen_down()
sprite.color("#3b82f6")
for i in range(5):
    sprite.move(120)
    sprite.turn_right(144)
sprite.pen_up()
sprite.move(30)
sprite.say("Star drawing complete!")`;
        break;
      case 'listcomp':
        demoCode = `# Testing List Comprehension desugaring unrolls
numbers = [1, 2, 3, 4, 5]
y = [x * 10 for x in numbers]
print(y)`;
        break;
      case 'ternary':
        demoCode = `# Testing Ternary Operator desugaring unrolls
speed = 120
status = "Danger" if speed > 100 else "Safe"
print(status)`;
        break;
      case 'chained':
        demoCode = `# Testing Chained Comparisons unrolls
speed = 85
if 60 < speed < 120:
    print("Normal cruising speed activated")`;
        break;
      case 'augmented':
        demoCode = `# Testing Loop variables updates
count = 0
for i in range(4):
    count += 2
    print(count)`;
        break;
    }

    setCode(demoCode);
    setHighlightedLine(null);
    setDrawnLines([]);
    setLogs([`[System] Demo script "${type}" loaded into workspace.`]);

    setTimeout(() => {
      syncCodeToBlocks(demoCode);
    }, 100);
  };

  // ── Gray (raw) block inspector: collect the fallback blocks, jump to each ──────
  const refreshGrayBlocks = () => {
    const ws = window.__blocklyWorkspace ||
      (window.Blockly && window.Blockly.getMainWorkspace && window.Blockly.getMainWorkspace());
    if (!ws) { setGrayBlocks([]); return; }
    const list = ws.getAllBlocks()
      .filter((b) => b.type === 'raw_statement' || b.type === 'raw_expression')
      .map((b) => ({
        id: b.id,
        kind: b.type === 'raw_statement' ? 'statement' : 'expression',
        text: (b.getFieldValue('STMT') || b.getFieldValue('EXPR') || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      }));
    setGrayBlocks(list);
  };

  const jumpToGray = (id) => {
    const ws = window.__blocklyWorkspace ||
      (window.Blockly && window.Blockly.getMainWorkspace && window.Blockly.getMainWorkspace());
    if (!ws) return;
    setActiveEditorTab('blockly');
    requestAnimationFrame(() => {
      try {
        const b = ws.getBlockById(id);
        if (!b) return;
        if (typeof ws.centerOnBlock === 'function') ws.centerOnBlock(id);
        if (typeof b.select === 'function') b.select();
      } catch (_) { /* ignore */ }
    });
  };

  // ── Image upload (App-Inventor-style): feed a real image to cv2.imread ─────────
  const handleImageUpload = async (file) => {
    if (!file) return;
    try {
      setPyodideLoading(!pyodideReady);
      const buf = new Uint8Array(await file.arrayBuffer());
      // (1) Pyodide FS — for the in-browser Run.
      await writeImageToFS(file.name, buf);
      setPyodideReady(true);
      setPyodideLoading(false);
      setUploadedImageName(file.name);
      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(file);
      });
      // (2) Backend media dir — for the "Run (Shell)" real-python path.
      let shellNote = '';
      try {
        const resp = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, dataBase64: dataUrl }),
        });
        if (resp.ok) { const d = await resp.json(); shellNote = ` (also usable in Shell run via cv2.imread("${d.savedAs}"))`; }
      } catch (_) { /* backend may be off — browser Run still works */ }
      setCv2Images([{ title: `Uploaded: ${file.name}`, dataUrl }]);
      setUploadedMedia((prev) => [{ name: file.name, dataUrl }, ...prev.filter((m) => m.name !== file.name)].slice(0, 12));
      setLogs((prev) => [...prev, `[Image] "${file.name}" uploaded — use cv2.imread("${file.name}").${shellNote}`]);
    } catch (e) {
      setLogs((prev) => [...prev, `[Image upload error] ${e.message || e}`]);
    }
  };

  // ── Real pip install (backend) — installs into the local Python used by Shell runs ──
  const [pipPkg, setPipPkg] = useState('');
  const handlePipInstallShell = async () => {
    const pkg = pipPkg.trim();
    if (!pkg) return;
    setActiveAuxTab('logs');
    setLogs((prev) => [...prev, `[pip] Installing: pip install ${pkg} ...`]);
    try {
      const resp = await fetch('/api/pip-install', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg }),
      });
      if (!resp.ok || !resp.body) {
        setLogs((prev) => [...prev, `[pip] Response error (${resp.status}). Check npm run server.`]); return;
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      for (;;) { const { done, value } = await reader.read(); if (done) break; const t = dec.decode(value, { stream: true }); if (t) setLogs((prev) => [...prev, t.replace(/\n+$/, '')]); }
    } catch (e) {
      setLogs((prev) => [...prev, `[pip] Error: ${e.message}. Make sure the backend is running.`]);
    }
  };

  // ── Run in a real local Python shell (backend) — real cv2, real webcam, real imshow ──
  // Streams stdout/stderr from the actual `python` process. Native OpenCV windows (imshow,
  // VideoCapture) open on the user's desktop. Requires the backend (npm run server).
  const handleRunShell = async () => {
    setCv2Images([]);
    setLogs([`[Shell] Running real Python (local python + real cv2). imshow/webcam windows open on the desktop.`, `[Shell] Code:\n${code}`]);
    setActiveAuxTab('logs');
    setIsRunning(true);
    const controller = new AbortController();
    shellAbortRef.current = controller;
    try {
      const resp = await fetch('/api/run-python', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        setLogs((prev) => [...prev, `[Shell] Backend response error (${resp.status}). Make sure npm run server is running.`]);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) setLogs((prev) => [...prev, text.replace(/\n+$/, '')]);
      }
    } catch (e) {
      if (e.name === 'AbortError') setLogs((prev) => [...prev, '[Shell] Stopped.']);
      else setLogs((prev) => [...prev, `[Shell] Error: ${e.message}. Make sure the backend (npm run server) is running.`]);
    } finally {
      setIsRunning(false);
      shellAbortRef.current = null;
    }
  };

  // [1.2 live] After a run, introspect each imported module in the live Pyodide runtime and
  // register enriched blocks (real arg names + constant dropdown). Best-effort, capped so a
  // huge library API can't flood the palette — that's exactly the case the AI purpose-prompt
  // (1.3) is for. Logs counts so the user can verify introspection actually fired.
  const introspectImportedModules = async (src) => {
    const engine = abstractionEngineRef.current || window.__blockpyEngine;
    const py = (typeof window !== 'undefined') ? window.__pyodide : null;
    if (!engine || !py || typeof engine.introspectModule !== 'function') return;
    const mods = new Set();
    let m;
    const reImport = /^\s*import\s+([a-zA-Z_]\w*)/gm;
    const reFrom = /^\s*from\s+([a-zA-Z_]\w*)\s+import/gm;
    while ((m = reImport.exec(src))) mods.add(m[1]);
    while ((m = reFrom.exec(src))) mods.add(m[1]);
    const CAP = 60;
    for (const mod of mods) {
      try {
        const facts = await engine.introspectModule(mod, py);
        const total = (facts.functions || []).length + (facts.classes || []).length;
        if (total > CAP) {
          setLogs(prev => [...prev, `[Introspect] ${mod}: large API (${total} members) — skipped auto-registration. Use the AI purpose-prompt to pick a subset.`]);
          continue;
        }
        const res = engine.registerFromFacts(facts);
        setLogs(prev => [...prev, `[Introspect] ${mod}: ${res.functions.length} functions, ${res.constants} constants → blocks enriched.`]);
        if (engine.activeBlocks && engine.activeBlocks.length) {
          setInstalledBlocks(prev => {
            const known = new Set(prev.map(b => b.type));
            const added = engine.activeBlocks.filter(b => !known.has(b.type));
            return added.length ? [...prev, ...added] : prev;
          });
        }
      } catch (e) {
        setLogs(prev => [...prev, `[Introspect] ${mod}: skipped (${String(e.message || e).slice(0, 60)})`]);
      }
    }
  };

  // ── Run: Pyodide real Python execution ────────────────────────────────────────
  const handleRunExecution = async () => {
    setDrawnLines([]);
    setHighlightedLine(null);
    setVariables({});
    setCv2Images([]);
    setIsRunning(true);
    setPyodideLoading(!pyodideReady);

    setLogs([
      '[Python] Starting real Python (Pyodide)...',
      `[Python] Code:\n${code}`
    ]);

    const spriteCallback = (cmd, state) => {
      setSpriteState({
        x: state.x, y: state.y, angle: state.angle,
        penDown: state.penDown, color: state.color, sayBubble: state.sayBubble
      });
      if (cmd === 'move' && state.penDown) {
        setDrawnLines(prev => [...prev, {
          x1: state.oldX, y1: state.oldY,
          x2: state.newX, y2: state.newY,
          color: state.color
        }]);
      }
    };

    await runCode(code, {
      onLog: (msg) => {
        setPyodideLoading(false);
        setPyodideReady(true);
        setLogs(prev => [...prev, msg]);
      },
      onSpriteCommand: spriteCallback,
      onCv2Action: handleCv2Action,
      onCv2Image: (title, dataUrl) => {
        setCv2Images((prev) => {
          const rest = prev.filter((im) => im.title !== title);
          return [...rest, { title, dataUrl }];
        });
      },
      onComplete: (err) => {
        setPyodideLoading(false);
        setPyodideReady(true);
        setIsRunning(false);
        setHighlightedLine(null);
        if (!err) {
          setLogs(prev => [...prev, '[Python] Execution completed.']);
          // [1.2 live] After a successful run, introspect each imported module in the live
          // Pyodide runtime and enrich its generated blocks (real arg names + constant
          // dropdown). Best-effort + non-blocking; logs results so the user can verify.
          introspectImportedModules(code);
        }
      }
    });
  };

  // ── Stop: interrupt Pyodide execution ─────────────────────────────────────────
  const handleStopExecution = () => {
    interruptPyodide();
    if (shellAbortRef.current) { try { shellAbortRef.current.abort(); } catch (_) {} }
    setHighlightedLine(null);
    setIsRunning(false);
    setSpriteState({ x: 240, y: 140, angle: 0, penDown: false, color: '#a855f7', sayBubble: null });
    setLogs(prev => [...prev, '[Python] Stopped.']);
  };

  // ── pip install handler ───────────────────────────────────────────────────────
  const handlePipInstall = async (packageName) => {
    setLogs(prev => [...prev, `[pip] Installing ${packageName}...`]);
    const ok = await pipInstall(packageName, (msg) => setLogs(prev => [...prev, msg]));
    if (ok) setPyodideReady(true);
  };

  const handleAbstractLibrary = async (libKey, customCode) => {
    setIsAbstracting(true);
    setAiThoughts([]);
    setLogs(prev => [...prev, `[AI Agent] Abstracting library: "${libKey}"...`]);
    const reg = window.BlockPyLibRegistry;

    try {
      // Best-effort introspection grounding (live Pyodide). Failure is fine — AI works from name.
      let facts = null;
      try {
        const py = await window.BlockPyAstBridge.getPyodide();
        const engine = new window.BlockPyAbstraction.LibraryAbstractionEngine();
        facts = await engine.introspectModule(libKey, py);
      } catch (_) { facts = null; }

      // Ask the backend; on 503 (no keys) fall back to the offline preset.
      let libName = libKey;
      let blocks = [];
      let thoughts = [];
      let response = null;
      try {
        response = await fetch('/api/ai-abstract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ libName: libKey, customCode, facts }),
        });
      } catch (_) {
        response = null;   // backend unreachable (Express :3001 down / connection refused)
      }
      // Parse the JSON only when the response looks ok; a 503 (no keys) / 500 (outage) body may not
      // be success-shaped.
      let data = null;
      if (response && response.ok) {
        try { data = await response.json(); } catch (_) { data = null; }
      }
      if (!response || !response.ok || !data || !data.success) {
        // ANY backend failure — unreachable (fetch threw), 503 (no keys), 500 (outage), or
        // success:false — falls back to the offline preset when one exists (spec §6).
        const preset = window.BlockPyAbstraction.AI_PRESETS[libKey];
        if (!preset) {
          const why = !response ? 'backend unreachable' : (!response.ok ? `backend ${response.status}` : ((data && data.error) || 'AI failed'));
          setLogs(prev => [...prev, `[AI Agent] ${why} and no offline preset for "${libKey}".`]);
          return;
        }
        blocks = preset.blocks;
        thoughts = preset.thoughts;
        const why = !response ? 'unreachable' : (!response.ok ? String(response.status) : 'AI failed');
        setLogs(prev => [...prev, `[AI Agent] Backend ${why} — using offline preset for "${libKey}".`]);
      } else {
        libName = data.libName || libKey;
        blocks = data.blocks || [];
        thoughts = data.thoughts || [];
      }

      // Stream the thoughts for the UI.
      const revealed = [];
      for (const thought of thoughts) {
        revealed.push(thought);
        setAiThoughts([...revealed]);
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Register each CALL block through the round-trip oracle. Macro-shaped responses (no
      // func / no args array) are skipped in the MVP. Oracle failures are demoted (not registered).
      let pyForOracle = null;
      try { pyForOracle = await window.BlockPyAstBridge.getPyodide(); } catch (_) { pyForOracle = null; }
      const registered = [];
      let rejected = 0;
      for (const b of blocks) {
        if (typeof b.func !== 'string' || !Array.isArray(b.args)) { rejected++; continue; } // macro/invalid
        const spec = reg.specFromDescriptor(b, libName);
        if (pyForOracle) {
          const ok = await reg.validateSpecParse(spec, window.BlockPyAstBridge.pythonToIR, pyForOracle);
          if (!ok) { rejected++; setLogs(prev => [...prev, `[AI Agent] Demoted "${spec.title}" (round-trip oracle).`]); continue; }
        }
        const res = reg.registerLibBlock(spec);
        if (!res.ok) { rejected++; setLogs(prev => [...prev, `[AI Agent] Demoted "${spec.title}" (${res.reason}).`]); continue; }
        const stored = reg.getLibSpec(res.type) || spec;   // idempotent no-op keeps the FIRST spec; mirror the registry, not the new descriptor
        registered.push({ type: res.type, title: stored.title, hasOutput: stored.hasOutput, func: stored.func, args: stored.argNames || stored.args, colour: stored.colour });
      }
      reg.persist();

      setInstalledBlocks(prev => {
        const filtered = prev.filter(p => !registered.some(r => r.type === p.type));
        return [...filtered, ...registered];
      });
      setLogs(prev => [...prev, `[Library] ✅ Registered ${registered.length} block(s) for "${libName}"${rejected ? `, ${rejected} demoted` : ''}.`]);
    } catch (err) {
      console.error(err);
      setLogs(prev => [...prev, `[AI Agent Error] ${err.message}`]);
    } finally {
      setIsAbstracting(false);
    }
  };

  // Phase B/C: introspection-based blocking. Hits /api/blockify (real Python, no AI cost) for the
  // ground-truth LibrarySpec, then registers libRegistry blocks (window.BlockPyLibImport) into the
  // Library palette + lossless IR round-trip. With a `purpose`, an extra LLM pass (/api/abstract-
  // library) curates a small, grouped, friendly-labelled subset grounded in that spec (Phase C);
  // without one, every entry is mapped (Phase B).
  const handleBlockifyLibrary = async (moduleName, purpose) => {
    const mod = (moduleName || '').trim();
    if (!mod) return;
    const wantCurate = !!(purpose && purpose.trim());
    setIsAbstracting(true);
    setAiThoughts([]);
    setLogs(prev => [...prev, `[Blockify] Introspecting "${mod}" (real Python)...`]);
    const reg = window.BlockPyLibRegistry;
    const imp = window.BlockPyLibImport;
    try {
      let response = null;
      try {
        response = await fetch('/api/blockify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: mod }),
        });
      } catch (_) { response = null; }
      let data = null;
      if (response && response.ok) { try { data = await response.json(); } catch (_) { data = null; } }
      if (!response || !response.ok || !data || !data.success || !data.spec) {
        const why = !response ? 'backend unreachable (is the Express server running?)'
          : (!response.ok ? `backend ${response.status}` : ((data && data.error) || 'introspection failed'));
        setLogs(prev => [...prev, `[Blockify] ${why} for "${mod}".`]);
        return;
      }
      const librarySpec = data.spec;

      // Phase C — purpose-driven curation (grounded LLM selection of a labelled subset).
      let mapped;
      let macroCount = 0;
      let macroDefs = [];
      if (wantCurate) {
        setLogs(prev => [...prev, `[Curate] Asking the AI to pick blocks for: "${purpose.trim()}"…`]);
        let cres = null;
        try {
          cres = await fetch('/api/abstract-library', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spec: librarySpec, purpose: purpose.trim() }),
          });
        } catch (_) { cres = null; }
        let cdata = null;
        if (cres && cres.ok) { try { cdata = await cres.json(); } catch (_) { cdata = null; } }
        if (!cres || !cres.ok || !cdata || !cdata.success) {
          const why = !cres ? 'backend unreachable' : (!cres.ok ? `backend ${cres.status}` : ((cdata && cdata.error) || 'AI failed'));
          setLogs(prev => [...prev, `[Curate] ${why} — falling back to full blockify for "${mod}".`]);
          mapped = imp.librarySpecToRegistrySpecs(librarySpec);
        } else {
          mapped = imp.curationToRegistrySpecs(librarySpec, cdata.selected || []);
          // Phase C2: composite macro blocks (grounded multi-step workflows) — added after the
          // fresh-removal below so they aren't wiped by removeMacrosBySource.
          macroDefs = imp.macrosToRegistry(librarySpec, cdata.macros || []);
          macroCount = macroDefs.length;
          setAiThoughts([...(cdata.thoughts || []),
            `Curated ${mapped.specs.length} of ${librarySpec.entries.length} entries${macroCount ? ` (+${macroCount} macro workflow${macroCount > 1 ? 's' : ''})` : ''} for: ${purpose.trim()}`,
            `Add this import to run the blocks: ${mapped.importStmt}`]);
        }
      } else {
        mapped = imp.librarySpecToRegistrySpecs(librarySpec);
        setAiThoughts([
          `Introspected ${librarySpec.module} → ${librarySpec.entries.length} API entries${data.cached ? ' (cached)' : ''}.`,
          `Alias "${mapped.alias}" — add this import to run the blocks: ${mapped.importStmt}`,
          `Mapping ${mapped.specs.length} blocks into the Library palette…`,
        ]);
      }

      // Fresh registration: replace this library's prior blocks + macros so a re-run's labels/
      // groups/macros win (not shadowed by first-spec). Done here — after the curation network
      // round-trip — so the old palette stays visible during the wait, then swaps atomically.
      const removedTypes = reg.removeModules(imp.libraryModules(librarySpec));
      reg.removeMacrosBySource(librarySpec.module);

      const registered = [];
      let rejected = 0;
      for (const spec of mapped.specs) {
        const res = reg.registerLibBlock(spec);
        if (!res.ok) { rejected++; continue; }
        const stored = reg.getLibSpec(res.type) || spec;
        registered.push({ type: res.type, title: stored.title, hasOutput: stored.hasOutput, func: stored.func, args: stored.argNames, colour: stored.colour });
      }
      for (const md of macroDefs) reg.addMacro(md);
      reg.persist();
      setInstalledBlocks(prev => {
        const drop = new Set([...removedTypes, ...registered.map(r => r.type)]);
        return [...prev.filter(p => !drop.has(p.type)), ...registered];
      });
      const tag = wantCurate ? 'Curate' : 'Blockify';
      setLogs(prev => [...prev, `[${tag}] ✅ ${registered.length} block(s)${macroCount ? ` + ${macroCount} macro(s)` : ''} from "${mod}" added to the Library palette${rejected ? `, ${rejected} skipped` : ''}. Import: ${mapped.importStmt}`]);
    } catch (err) {
      console.error(err);
      setLogs(prev => [...prev, `[Blockify Error] ${err.message}`]);
    } finally {
      setIsAbstracting(false);
    }
  };

  const handleBlocklyCodeChange = (newCode) => {
    setCode(newCode);
    associatedPythonRef.current = newCode;
  };

  const handleBlocklySnapshotChange = (newSnapshot) => {
    blocklySnapshotRef.current = newSnapshot;
  };

  const handleSyncToBlocksClick = () => {
    syncCodeToBlocks(code);
  };

  const handleFormatCode = () => {
    const formatted = code.split('\n')
                          .map(line => line.trimEnd())
                          .join('\n')
                          .trim();
    setCode(formatted);
    setLogs(prev => [...prev, '[System] Cleaned trailing spaces and formatted editor lines.']);
  };

  // Theme Toggler — default is the Claude cream canvas; toggle flips to the in-brand dark navy.
  const toggleTheme = () => {
    setIsDarkTheme(!isDarkTheme);
    document.body.classList.toggle('theme-dark');
    
    // Refresh workspace layout safely
    if (workspaceRef.current) {
      const savedSnapshot = window.Blockly.serialization.workspaces.save(workspaceRef.current);
      workspaceRef.current.dispose();
      
      // Mount will naturally rerun inside BlocklyEditor once it is recreated/reloaded.
      setTimeout(() => {
        if (workspaceRef.current) {
          window.Blockly.serialization.workspaces.load(savedSnapshot, workspaceRef.current);
        }
      }, 50);
    }
  };

  // Phase 4 slice 4: the preview pane reflects the REAL IR desugar (desugaredPreview, computed by
  // the effect above) — the SAME pass "Auto Desugar" applies to blocks — not the legacy text
  // heuristic. (desugarer.js stays loaded for the server endpoints; just not used here.)
  const desugarChanged = !!desugaredPreview && desugaredPreview.trim() !== code.trim();
  const explanationHtml = desugarChanged
    ? 'Desugared (IR-level): comprehensions / ternaries / chained comparisons in provably-safe positions were rewritten to loops / conditionals / booleans; lazy or unsafe sugar is preserved.'
    : 'No desugarable sugar in safe positions — the desugared output matches the source.';

  return (
    <div className="harness-container">
      {/* Header bar removed — Auto Desugar + theme controls relocated into the
          AST Parser Tree tab to reclaim full-height vertical space. */}

      {/* Main Dashboard Layout grid */}
      <main className="dashboard-grid">
        {/* Left Side Panels: Stage, console, scopes, abstractions */}
        <section className="left-panel">
          {/* Unified left pane — Stage + watches + logs + gray blocks + AI/OpenCV, all as tabs */}
          <div className="tab-card">
            <div className="tab-header">
              <button
                id="tab-btn-stage"
                className={`tab-btn ${activeAuxTab === 'stage' ? 'active' : ''}`}
                onClick={() => setActiveAuxTab('stage')}
              >
                Stage
              </button>
              <button
                id="tab-btn-variables"
                className={`tab-btn ${activeAuxTab === 'variables' ? 'active' : ''}`}
                onClick={() => setActiveAuxTab('variables')}
              >
                Variable
              </button>
              <button
                id="tab-btn-logs"
                className={`tab-btn ${activeAuxTab === 'logs' ? 'active' : ''}`}
                onClick={() => setActiveAuxTab('logs')}
              >
                Terminal
              </button>
              <button
                id="tab-btn-gray"
                className={`tab-btn ${activeAuxTab === 'gray' ? 'active' : ''}`}
                onClick={() => { setActiveAuxTab('gray'); refreshGrayBlocks(); }}
                title="Parts left as gray (raw) blocks that could not convert to dedicated blocks"
              >
                Logs{grayBlocks.length ? ` (${grayBlocks.length})` : ''}
              </button>
              <button
                id="tab-btn-library"
                className={`tab-btn ${activeAuxTab === 'ai' ? 'active' : ''}`}
                onClick={() => setActiveAuxTab('ai')}
              >
                AI
              </button>
            </div>
            <div className="tab-content-wrapper">
              {activeAuxTab === 'stage' && (
                <div className="stage-tab-scroll">
                  <Stage
                    spriteState={spriteState}
                    drawnLines={drawnLines}
                    isRunning={isRunning}
                    onRun={handleRunExecution}
                    onStop={handleStopExecution}
                    onClearCanvas={() => setDrawnLines([])}
                  />
                  {uploadedMedia.length > 0 && (
                    <div className="uploaded-media">
                      <div className="uploaded-media-head">
                        <span><i className="fa-solid fa-photo-film"></i> Uploaded Media ({uploadedMedia.length})</span>
                        <button className="btn btn-secondary btn-xs" onClick={() => setUploadedMedia([])}>Clear</button>
                      </div>
                      <div className="uploaded-media-grid">
                        {uploadedMedia.map((m, i) => (
                          <figure key={i} className="uploaded-media-item" title={m.name}>
                            <img src={m.dataUrl} alt={m.name} />
                            <figcaption>{m.name}</figcaption>
                          </figure>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeAuxTab === 'variables' && (
                <VariableWatch variables={variables} />
              )}
              {activeAuxTab === 'logs' && (
                <ConsoleLogs
                  logs={logs}
                  onClearConsole={() => setLogs([])}
                />
              )}
              {activeAuxTab === 'ai' && (
                <div className="ai-tab-scroll">
                  <LibraryManager
                    onAbstract={handleAbstractLibrary}
                    onBlockify={handleBlockifyLibrary}
                    onPipInstall={handlePipInstall}
                    installedBlocks={installedBlocks}
                    aiThoughts={aiThoughts}
                    isAbstracting={isAbstracting}
                    pyodideReady={pyodideReady}
                    pyodideLoading={pyodideLoading}
                    pipPkg={pipPkg}
                    onPipPkgChange={setPipPkg}
                    onPipInstallShell={handlePipInstallShell}
                  />
                </div>
              )}
              {activeAuxTab === 'gray' && (
                <div className="gray-blocks-panel">
                  <div className="gray-blocks-head">
                    <span>Gray (unconverted) blocks: <b>{grayBlocks.length}</b></span>
                    <button className="btn btn-secondary btn-sm" onClick={refreshGrayBlocks}>
                      <i className="fa-solid fa-rotate"></i> Refresh
                    </button>
                  </div>
                  {grayBlocks.length === 0 ? (
                    <div className="gray-blocks-empty">
                      No unconverted parts. Check here after Convert.
                    </div>
                  ) : (
                    <ul className="gray-blocks-list">
                      {grayBlocks.map((g) => (
                        <li key={g.id} className="gray-block-item" onClick={() => jumpToGray(g.id)} title="Click to jump to the block">
                          <span className="gray-block-kind">{g.kind}</span>
                          <code className="gray-block-text">{g.text}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Side Panels: Interactive Editors, desugaring analysis */}
        <section className="right-panel">
          <div className="editor-tab-card" style={{ flex: 1, height: '100%' }}>
            <div className="editor-tab-header">
              <button 
                id="tab-btn-blockly"
                className={`tab-btn ${activeEditorTab === 'blockly' ? 'active' : ''}`}
                onClick={() => setActiveEditorTab('blockly')}
              >
                <i className="fa-solid fa-cubes"></i> Visual Blocks Workspace
              </button>
              <button 
                id="tab-btn-python"
                className={`tab-btn ${activeEditorTab === 'python' ? 'active' : ''}`}
                onClick={() => setActiveEditorTab('python')}
              >
                <i className="fa-brands fa-python"></i> Python Source Editor
              </button>
              <button 
                id="tab-btn-desugar"
                className={`tab-btn ${activeEditorTab === 'desugar' ? 'active' : ''}`}
                onClick={() => setActiveEditorTab('desugar')}
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i> Desugared Code Normalizer
              </button>
              <button
                id="tab-btn-ast"
                className={`tab-btn ${activeEditorTab === 'ast' ? 'active' : ''}`}
                onClick={() => setActiveEditorTab('ast')}
              >
                <i className="fa-solid fa-diagram-project"></i> AST Parser Tree
              </button>
              {/* Run (real shell) + image upload — output opens in a separate Python window */}
              <div className="editor-tab-actions">
                <button
                  className="btn btn-primary btn-sm"
                  id="btn-run-shell"
                  onClick={handleRunShell}
                  title="Run for real in local Python (shell) — cv2/imshow output opens in a separate Python window"
                >
                  <i className="fa-solid fa-play"></i> Run
                </button>
                <label className="btn btn-secondary btn-sm" htmlFor="cv-image-upload" style={{ cursor: 'pointer' }}>
                  <i className="fa-solid fa-upload"></i> Image
                  <input
                    id="cv-image-upload"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImageUpload(e.target.files && e.target.files[0])}
                  />
                </label>
              </div>
            </div>
            
            <div className="editor-content-wrapper" style={{ height: 'calc(100% - 48px)' }}>
              <div style={{ display: activeEditorTab === 'blockly' ? 'block' : 'none', height: '100%' }}>
                <BlocklyEditor
                  onCodeChange={handleBlocklyCodeChange}
                  onSnapshotChange={handleBlocklySnapshotChange}
                  initialSnapshot={blocklySnapshotRef.current}
                  isSyncingFromCode={isSyncingFromCodeRef}
                  workspaceRef={workspaceRef}
                />
              </div>
              <div style={{ display: activeEditorTab === 'python' ? 'block' : 'none', height: '100%' }}>
                <PythonEditor
                  code={code}
                  onCodeChange={setCode}
                  onSyncToBlocks={handleSyncToBlocksClick}
                  syntaxStatus={syntaxStatus}
                  highlightedLine={highlightedLine}
                  onLoadExample={(sn) => { setCode(sn.code); setShouldDesugar(sn.desugar); }}
                />
              </div>
              <div style={{ display: activeEditorTab === 'desugar' ? 'block' : 'none', height: '100%' }}>
                <div className="tools-content-wrapper" style={{ height: '100%', overflow: 'auto' }}>
                  <div className="desugar-preview-pane">
                    <div className="desugar-split">
                      <div className="code-block-box">
                        <div className="box-title">Original Advanced Syntax</div>
                        <pre id="sugar-original-code">{code}</pre>
                      </div>
                      <div className="code-block-box">
                        <div className="box-title">Desugared Normalized Code</div>
                        <pre id="desugared-target-code">
                          {desugaredPreview || '# No changes required.'}
                        </pre>
                      </div>
                    </div>
                    <div id="desugar-explanation-text" className="explanation-alert">
                      <i className="fa-solid fa-circle-info"></i> {explanationHtml}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: activeEditorTab === 'ast' ? 'block' : 'none', height: '100%' }}>
                <div className="tools-content-wrapper" style={{ height: '100%', overflow: 'auto' }}>
                  <div className="ast-controls-row">
                    <label className="toggle-group" htmlFor="toggle-desugar">
                      <input
                        type="checkbox"
                        id="toggle-desugar"
                        checked={shouldDesugar}
                        onChange={(e) => setShouldDesugar(e.target.checked)}
                      />
                      <span>Auto Desugar</span>
                    </label>
                    <button
                      id="theme-toggle"
                      className="btn btn-secondary btn-icon-only theme-btn"
                      onClick={toggleTheme}
                      title="Toggle theme styling"
                    >
                      <i className={isDarkTheme ? "fa-solid fa-moon" : "fa-solid fa-sun"}></i>
                    </button>
                  </div>
                  <ASTTreeView
                    code={code}
                    onHoverLine={(line) => setHighlightedLine(line)}
                    onLeaveLine={() => setHighlightedLine(null)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
