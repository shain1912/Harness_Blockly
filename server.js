require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const BlockPyDesugarer = require('./src/utils/desugarer');
const BlockPyAbstraction = require('./src/utils/libraryAbstraction');

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' })); // allow base64 image uploads

// ─── Static frontend serving (Electron / packaged desktop build) ────────────────
// In dev the Vite server hosts the frontend and proxies /api here. In the packaged
// Electron app there is no Vite: this server hosts the built `dist/` itself so the
// renderer loads from http://127.0.0.1:<port> on the SAME origin as /api. The COOP/COEP
// headers mirror vite.config.js — they are REQUIRED for the SharedArrayBuffer that powers
// Pyodide's interrupt buffer (Stop button) and must be present on every document/asset.
const STATIC_DIR = process.env.BLOCKPY_STATIC_DIR;
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
  });
  app.use(express.static(STATIC_DIR));
  console.log(`🖥️  Serving built frontend from: ${STATIC_DIR}`);
}

// Workspace directory on real disk — the project root the user sees in the file explorer.
// It is the working directory for shell-run Python, so cv2.imread('name.jpg'), open('data.txt'),
// cv2.imwrite('out.png') etc. all resolve against (and appear in) this folder. Uploaded images
// land here too. Override with BLOCKPY_WORKSPACE; defaults to ~/BlockPyWorkspace.
const WORKSPACE_DIR = process.env.BLOCKPY_WORKSPACE || path.join(os.homedir(), 'BlockPyWorkspace');
try { fs.mkdirSync(WORKSPACE_DIR, { recursive: true }); } catch (_) {}
// MEDIA_DIR kept as an alias for existing call sites (uploads, seed images, run cwd).
const MEDIA_DIR = WORKSPACE_DIR;

// Resolve a client-supplied relative path INSIDE the workspace, rejecting traversal/absolute
// escapes. Returns the absolute path, or null if it would leave the workspace.
function safeResolve(relPath) {
  const rel = String(relPath == null ? '' : relPath).replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(WORKSPACE_DIR, rel);
  const root = path.resolve(WORKSPACE_DIR);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === 'win32' ? 'python' : 'python3');

// ─── blockpy-gen introspection (ESM, lazy-imported into this CJS server) ───────
// /api/blockify turns an importable module into a LibrarySpec by importing it in a python
// subprocess (executes its top-level code) — the SAME trust level the app already grants
// /api/run-python and /api/pip-install. BLOCKIFY_ALLOW (comma-separated) optionally restricts
// which modules may be introspected; unset = allow any (local single-user posture).
const { pathToFileURL } = require('url');
// In the packaged Electron app __dirname lives inside app.asar, but blockpy-gen is asarUnpack'd
// (dynamic import()/spawn of files inside an asar fails). Redirect to the on-disk unpacked copy.
// In dev __dirname is the repo root, so this is a no-op.
function genBase() {
  let base = __dirname;
  if (base.includes('app.asar') && !base.includes('app.asar.unpacked')) {
    base = base.replace('app.asar', 'app.asar.unpacked');
  }
  return base;
}
let _introspectPromise = null;
function getIntrospect() {
  if (!_introspectPromise) {
    const url = pathToFileURL(path.join(genBase(), 'blockpy-gen', 'src', 'introspect', 'introspect.js')).href;
    _introspectPromise = import(url).then((m) => m.introspectModule);
  }
  return _introspectPromise;
}
const BLOCKIFY_ALLOW = (process.env.BLOCKIFY_ALLOW || '').split(',').map((s) => s.trim()).filter(Boolean);
const _blockifyCache = new Map();
// Accepts a dotted import path (numpy, PIL.Image) OR a pip distribution name with dashes
// (opencv-python, scikit-learn) — _inspect.py resolves a distribution name to its real import.
const MODULE_PATH_RE = /^[A-Za-z0-9_]+([.-][A-Za-z0-9_]+)*$/;
if (BLOCKIFY_ALLOW.length === 0) {
  console.warn('[blockify] No BLOCKIFY_ALLOW set — /api/blockify will import ANY requested module (executes top-level code). Local single-user use only; set BLOCKIFY_ALLOW=mod1,mod2 to restrict.');
}

// Seed a synthetic sample image into the demo filenames using the real local cv2, so
// OpenCV examples produce output in shell mode even before any upload (best-effort).
function seedSampleImages() {
  const py = [
    'import cv2, numpy as np, os',
    `d = r"${MEDIA_DIR.replace(/\\/g, '\\\\')}"`,
    'img = np.full((240,320,3), 30, np.uint8)',
    'cv2.rectangle(img,(40,50),(150,170),(0,0,255),-1)',
    'cv2.circle(img,(230,110),55,(0,200,0),-1)',
    'cv2.putText(img,"BlockPy",(30,215),cv2.FONT_HERSHEY_SIMPLEX,1.0,(255,255,255),2)',
    'for f in ["sample.jpg"]:',
    '    p=os.path.join(d,f)',
    '    if not os.path.exists(p): cv2.imwrite(p,img)',
  ].join('\n');
  const f = path.join(os.tmpdir(), `blockpy_seed_${Date.now()}.py`);
  try {
    fs.writeFileSync(f, py, 'utf8');
    const c = spawn(PYTHON_CMD, [f], { env: process.env });
    c.on('close', () => { try { fs.unlinkSync(f); } catch (_) {} });
    c.on('error', () => { try { fs.unlinkSync(f); } catch (_) {} });
  } catch (_) {}
}

// Seed a friendly starter file the first time the workspace is empty, so the explorer
// isn't blank on first run. Never overwrites existing user files.
function seedStarterFile() {
  try {
    const f = path.join(WORKSPACE_DIR, 'main.py');
    if (fs.existsSync(f)) return;
    const hasAny = fs.readdirSync(WORKSPACE_DIR).some((n) => n.endsWith('.py'));
    if (hasAny) return;
    fs.writeFileSync(f, [
      '# Welcome to BlockPy! This file lives in your workspace folder.',
      '# Files you read/write run from here, e.g. cv2.imread("sample.jpg").',
      '',
      'print("Hello from BlockPy")',
      '',
      'for i in range(3):',
      '    print("count", i)',
      '',
    ].join('\n'), 'utf8');
  } catch (_) {}
}

// ─── MiniMax API Key Pool (Round-Robin) ───────────────────────────────────────
// Keys come from (in order): the dev .env (MINIMAX1~4), a writable per-machine config the in-app
// Settings panel saves (BLOCKPY_CONFIG, set by Electron to userData), and an optional read-only
// config you can pre-seed next to the .exe (BLOCKPY_CONFIG_RO). NOTHING is baked into the build —
// a distributed .exe ships with zero keys, so a key is never extractable from the binary.
let MINIMAX_KEYS = [];

// The single writable config the Settings panel POSTs to. Electron points this at userData; dev
// falls back to a gitignored file in the cwd.
function primaryConfigPath() {
  return process.env.BLOCKPY_CONFIG || path.join(process.cwd(), 'blockpy-config.json');
}

// All config files we READ keys from (writable primary + optional alongside-exe read-only seed).
function configPaths() {
  const out = [primaryConfigPath()];
  if (process.env.BLOCKPY_CONFIG_RO) out.push(process.env.BLOCKPY_CONFIG_RO);
  return out;
}

// A config file is JSON: { "keys": ["sk-...", ...] } (also accepts MINIMAX1..4 keys). Missing/bad → [].
function keysFromFile(p) {
  try {
    if (!p || !fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(raw.keys)) return raw.keys.filter(Boolean);
    return [raw.MINIMAX1, raw.MINIMAX2, raw.MINIMAX3, raw.MINIMAX4].filter(Boolean);
  } catch (_) { return []; }
}

let keyIndex = 0;
function loadKeys() {
  const envKeys = [process.env.MINIMAX1, process.env.MINIMAX2, process.env.MINIMAX3, process.env.MINIMAX4].filter(Boolean);
  const fileKeys = configPaths().flatMap(keysFromFile);
  MINIMAX_KEYS = [...new Set([...envKeys, ...fileKeys].map((k) => String(k).trim()).filter(Boolean))];
  keyIndex = 0;
  return MINIMAX_KEYS;
}
loadKeys();

if (MINIMAX_KEYS.length === 0) {
  console.error('[MiniMax] ⚠️  No API keys yet (env/.env or config). Set one in the app Settings — AI endpoints stay 503 until then.');
}

function getNextKey() {
  const key = MINIMAX_KEYS[keyIndex % MINIMAX_KEYS.length];
  keyIndex++;
  return key;
}

// Build an Anthropic client pointed at MiniMax's Anthropic-compatible endpoint
function createMiniMaxClient() {
  return new Anthropic({
    apiKey: getNextKey(),
    baseURL: 'https://api.minimax.io/anthropic',
  });
}

const MINIMAX_MODEL = 'MiniMax-M2.7';

// ─── Helper: stream thinking + text blocks from MiniMax response ─────────────
async function callMiniMax(systemPrompt, userContent, opts = {}) {
  const client = createMiniMaxClient();
  const message = await client.messages.create({
    model: MINIMAX_MODEL,
    max_tokens: opts.maxTokens || 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userContent }]
      }
    ]
  });

  let thinkingText = '';
  let responseText = '';

  for (const block of message.content) {
    if (block.type === 'thinking') thinkingText += block.thinking;
    else if (block.type === 'text') responseText += block.text;
  }

  return { thinkingText, responseText };
}

// ─── 1. AST Desugar (heuristic – no AI cost) ─────────────────────────────────
app.post('/api/desugar', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });
  const result = BlockPyDesugarer.desugarPythonCode(code);
  res.json(result);
});

// ─── AI key config (in-app Settings) ─────────────────────────────────────────
// Local-only (the server binds 127.0.0.1). GET returns STATUS ONLY — raw keys never leave the box,
// just a masked preview. POST saves keys to the per-machine config file and reloads the pool.
app.get('/api/ai-config', (req, res) => {
  res.json({
    configured: MINIMAX_KEYS.length > 0,
    count: MINIMAX_KEYS.length,
    masked: MINIMAX_KEYS.map((k) => (k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : '••••')),
    configPath: primaryConfigPath(),
    model: MINIMAX_MODEL,
  });
});

app.post('/api/ai-config', (req, res) => {
  const { keys, key } = req.body || {};
  let list = Array.isArray(keys) ? keys : (key != null ? [key] : null);
  if (!list) return res.status(400).json({ error: 'provide {keys:[...]} or {key:"..."}' });
  list = list.map((s) => String(s).trim()).filter(Boolean).slice(0, 8);   // cap the pool
  const p = primaryConfigPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ keys: list }, null, 2), 'utf8');
  } catch (e) {
    return res.status(500).json({ error: `could not write config: ${e.message}` });
  }
  loadKeys();
  res.json({ success: true, configured: MINIMAX_KEYS.length > 0, count: MINIMAX_KEYS.length, configPath: p });
});

// ─── 2. AI Normalize: MiniMax rewrites Python into block-friendly form ────────
app.post('/api/ai-normalize', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });

  // Fast heuristic first pass
  const heuristic = BlockPyDesugarer.desugarPythonCode(code);

  if (MINIMAX_KEYS.length === 0) {
    // Fallback to heuristic only
    return res.json({
      success: heuristic.success,
      desugaredPython: heuristic.desugaredPython || code,
      explanation: '[Heuristic] AI key unavailable – heuristic desugaring applied.',
      ast: heuristic.desugaredAST,
      thoughts: []
    });
  }

  try {
    const systemPrompt = `You are a Python code normalizer for a visual block programming system.
Your task: rewrite Python code into the simplest, most "block-friendly" equivalent.

Rules (strict):
1. Unroll ALL list comprehensions into a standard for-loop with .append().
2. Expand ALL ternary expressions (x if cond else y) into full if/else blocks.
3. Split ALL chained comparisons (a < b < c) into (a < b and b < c).
4. Keep all other logic identical – never change semantics.
5. Never add imports, comments, or explanations in the code output.
6. Output ONLY the transformed Python code, nothing else.`;

    const { thinkingText, responseText } = await callMiniMax(systemPrompt, code, { maxTokens: 2048 });

    const thoughts = thinkingText
      ? thinkingText.split('\n').filter(l => l.trim()).slice(0, 8)
      : ['AI normalizer applied. Code is now block-friendly.'];

    res.json({
      success: true,
      desugaredPython: responseText.trim() || heuristic.desugaredPython || code,
      explanation: 'MiniMax-M2.7 rewrote the code into block-safe canonical form.',
      ast: heuristic.desugaredAST,
      thoughts
    });
  } catch (err) {
    console.error('[/api/ai-normalize] MiniMax error:', err.message);
    // Graceful fallback
    res.json({
      success: heuristic.success,
      desugaredPython: heuristic.desugaredPython || code,
      explanation: `[Fallback] MiniMax error (${err.message}). Heuristic applied.`,
      ast: heuristic.desugaredAST,
      thoughts: [`Error: ${err.message}`]
    });
  }
});

// ─── 3. AI Library Abstraction: MiniMax designs visual blocks for a library ───
app.post('/api/ai-abstract', async (req, res) => {
  const { libName, customCode, facts, purpose } = req.body;
  if (!libName) return res.status(400).json({ error: 'libName is required' });

  // Check built-in presets first (no AI cost). Skip when the caller supplies introspection
  // facts or a purpose — those drive a grounded, purpose-specific subset via the AI.
  if (libName !== 'custom' && !facts && !purpose) {
    const preset = BlockPyAbstraction.AI_PRESETS[libName];
    if (preset) {
      return res.json({ success: true, libName, thoughts: preset.thoughts, blocks: preset.blocks });
    }
  }

  // Custom or unknown library → ask MiniMax
  if (MINIMAX_KEYS.length === 0) {
    return res.status(503).json({ error: 'No MiniMax API keys configured.' });
  }

  try {
    const systemPrompt = `You are a Python library block designer for a visual programming system.
Given a library name and/or sample usage code, design a minimal, complete set of Blockly-style visual blocks that covers its essential operations.

Respond in strict JSON only – no markdown, no extra text. Use this exact schema:
{
  "thoughts": ["reasoning step 1", "reasoning step 2", "...up to 6 steps"],
  "blocks": [
    {
      "func": "function_name",
      "args": ["arg1", "arg2"],
      "hasOutput": true,
      "colour": "#hexcolor",
      "title": "lib.function_name"
    }
  ]
}

Rules:
- Keep block names as Python identifiers (snake_case).
- hasOutput = true if the call returns a value, false if it's a statement.
- Choose distinct, pleasant hex colours for visual variety.
- Limit to the 6-10 most important operations.
- Never include function definition blocks or comment blocks.
- GROUNDING: when an "Actual public API" list is provided, use ONLY function names and argument names that appear in it — never invent signatures. Prefer the real argument names.
- PURPOSE: when a purpose is provided, select ONLY the subset of operations relevant to that purpose.`;

    // [1.3] Ground the prompt with the library's real API (from Pyodide introspection) and
    // the user's stated purpose, so the AI selects a correct, purpose-specific subset.
    const factsBlock = facts
      ? `\n\nActual public API (use ONLY these — do not invent):\nFunctions: ${(facts.functions || []).map(f => `${f.name}(${(f.params || []).join(', ')})`).join(', ') || '(none)'}\nConstants: ${(facts.constants || []).join(', ') || '(none)'}`
      : '';
    const purposeBlock = purpose ? `\n\nThe user wants to use this library for: ${purpose}` : '';
    const userContent = `Library: ${libName}${customCode ? `\nSample usage:\n${customCode}` : ''}${factsBlock}${purposeBlock}`;

    const { thinkingText, responseText } = await callMiniMax(systemPrompt, userContent, { maxTokens: 1500 });

    let parsed;
    try {
      // Strip possible markdown code fence if model wraps in ```json
      const jsonStr = responseText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error('MiniMax returned invalid JSON: ' + responseText.slice(0, 200));
    }

    const thoughts = [
      ...(thinkingText ? thinkingText.split('\n').filter(l => l.trim()).slice(0, 4) : []),
      ...(parsed.thoughts || [])
    ].slice(0, 8);

    res.json({
      success: true,
      libName,
      thoughts,
      blocks: parsed.blocks || []
    });
  } catch (err) {
    console.error('[/api/ai-abstract] MiniMax error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 3.5 Blockify: introspection-based library blocks (no AI cost) ────────────
// Real-API ground truth: imports the module in a python subprocess and returns a LibrarySpec
// the frontend maps to libRegistry blocks (src/utils/libImport.js). No MiniMax involved.
app.post('/api/blockify', async (req, res) => {
  const moduleName = ((req.body && req.body.module) || '').trim();
  const includePrivate = !!(req.body && req.body.includePrivate);
  const maxEntries = Math.min(Number((req.body && req.body.maxEntries) || 200) || 200, 500);
  if (!moduleName) return res.status(400).json({ error: 'module is required' });
  if (!MODULE_PATH_RE.test(moduleName)) return res.status(400).json({ error: 'invalid module name' });
  if (BLOCKIFY_ALLOW.length && !BLOCKIFY_ALLOW.includes(moduleName)) {
    return res.status(403).json({ error: `module '${moduleName}' not in BLOCKIFY_ALLOW` });
  }
  const key = `${moduleName}|${includePrivate ? 'p' : ''}|${maxEntries}`;
  if (!(req.body && req.body.refresh) && _blockifyCache.has(key)) {
    return res.json({ success: true, cached: true, spec: _blockifyCache.get(key) });
  }
  try {
    const introspect = await getIntrospect();
    const spec = await introspect(moduleName, { python: PYTHON_CMD, includePrivate, maxEntries });
    _blockifyCache.set(key, spec);
    res.json({ success: true, cached: false, spec });
  } catch (e) {
    console.error('[/api/blockify]', e.message);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

// Installed DIRECT dependencies of a distribution, mapped to import names (pyserial->serial).
// Lets a `pip install <pkg>` also blockify what it pulled in. Metadata only — no import/AI.
app.post('/api/deps', (req, res) => {
  const moduleName = ((req.body && req.body.module) || '').trim();
  if (!moduleName) return res.status(400).json({ error: 'module is required' });
  if (!MODULE_PATH_RE.test(moduleName)) return res.status(400).json({ error: 'invalid module name' });
  const f = path.join(genBase(), 'blockpy-gen', 'src', 'introspect', '_deps.py');
  let child;
  try { child = spawn(PYTHON_CMD, [f, moduleName], { env: process.env }); }
  catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => res.status(500).json({ error: String(e.message || e) }));
  child.on('close', (code) => {
    if (code !== 0) return res.status(500).json({ error: err.trim() || ('exit ' + code) });
    try { res.json({ success: true, ...JSON.parse(out) }); }
    catch (e) { res.status(500).json({ error: 'bad deps output: ' + e.message }); }
  });
});

// ─── 3.6 Abstract library by purpose (LLM curation + macros, grounded) ────────
// Given an introspected LibrarySpec (ground truth) + a purpose, MiniMax SELECTS a relevant
// subset, GROUPS + RELABELS it, and proposes composite MACROS — but only references real
// entries; the server drops any hallucinated ref so signatures always come from introspection.
function describeSpecEntry(spec, e) {
  const ps = (e.params || []).map((p) => {
    const star = p.kind === 'vararg' ? '*' : p.kind === 'kwarg' ? '**' : '';
    return star + p.name + (p.hasDefault ? '=…' : '');
  }).join(', ');
  const qn = e.qualName || (e.kind === 'method' ? `${spec.module}.${e.owner}.${e.name}` : `${spec.module}.${e.name}`);
  const kind = e.kind === 'method' ? 'method' : e.kind === 'class' ? 'class' : 'func';
  return `- [${kind}] ${qn}(${ps}) -> ${e.returns === false ? 'stmt' : 'value'}`;
}

app.post('/api/abstract-library', async (req, res) => {
  const { spec, purpose, max } = req.body || {};
  if (!spec || typeof spec.module !== 'string' || !Array.isArray(spec.entries)) {
    return res.status(400).json({ error: 'a LibrarySpec {module, entries[]} is required (call /api/blockify first)' });
  }
  if (!purpose || !String(purpose).trim()) return res.status(400).json({ error: 'purpose is required' });
  if (MINIMAX_KEYS.length === 0) return res.status(503).json({ error: 'No MiniMax API keys configured.' });

  const limit = Math.min(Number(max) || 18, 40);
  const validRefs = new Set(spec.entries.map((e) => e.qualName || (e.kind === 'method' ? `${spec.module}.${e.owner}.${e.name}` : `${spec.module}.${e.name}`)));
  // The model often copies the WHOLE descriptor line ("PIL.Image.open(fp, …) -> value") as the
  // ref; qualNames never contain '(', so strip from the first paren to recover the bare ref.
  const stripSig = (s) => String(s || '').split('(')[0].trim();
  const apiText = spec.entries.map((e) => describeSpecEntry(spec, e)).join('\n');

  try {
    const systemPrompt = `You curate a Python library's API into a small, purpose-focused set of visual blocks.
You are given the library's REAL API (ground truth) and the user's PURPOSE.

Respond in strict JSON only — no markdown. Schema:
{
  "thoughts": ["short reasoning", "..."],
  "groups": [ { "name": "Category name", "entries": [ { "ref": "<exact qualName from the list>", "label": "friendly short label" } ] } ],
  "macros": [ { "name": "snake_case_id", "label": "friendly label", "group": "Category name",
               "params": ["p1"], "steps": [ { "ref": "<exact qualName>", "assign": "var", "args": ["p1 or 'literal' or a prior var"] } ], "result": "var" } ]
}

Rules:
- "ref" MUST be copied EXACTLY from the API list — never invent names or signatures.
- Select ONLY operations relevant to the PURPOSE; at most ${limit} entries total across groups.
- Group into 2-5 intuitive categories. Write labels in the SAME LANGUAGE as the purpose.
- Macros chain 2-4 real calls into one task (optional). Each step.ref MUST be in the list; steps run top-to-bottom; later steps may use earlier "assign" vars.
- Prefer the most common, beginner-friendly operations.`;
    const userContent = `Library module: ${spec.module}\nPurpose: ${String(purpose).trim()}\n\nREAL API (use ONLY these refs):\n${apiText}`;

    const { thinkingText, responseText } = await callMiniMax(systemPrompt, userContent, { maxTokens: 2600 });
    let parsed;
    try {
      const jsonStr = responseText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error('MiniMax returned invalid JSON: ' + responseText.slice(0, 200));
    }

    // Flatten groups -> selected[]; drop hallucinated refs.
    const selected = [];
    let droppedSel = 0;
    for (const g of parsed.groups || []) {
      for (const en of (g && g.entries) || []) {
        const ref = en && stripSig(en.ref);
        if (ref && validRefs.has(ref)) selected.push({ ref, label: en.label || '', group: (g.name || '') });
        else droppedSel++;
      }
    }
    // Validate macros: every step.ref must be real; otherwise drop the whole macro.
    const macros = [];
    let droppedMac = 0;
    for (const m of parsed.macros || []) {
      const steps = Array.isArray(m && m.steps) ? m.steps : [];
      const normSteps = steps.map((s) => (s ? { assign: s.assign, args: s.args, ref: stripSig(s.ref) } : null));
      if (!m || !m.name || !normSteps.length || !normSteps.every((s) => s && validRefs.has(s.ref))) { droppedMac++; continue; }
      macros.push({
        name: String(m.name), label: m.label || m.name, group: m.group || '',
        params: Array.isArray(m.params) ? m.params.map(String) : [],
        steps: normSteps.map((s) => ({ ref: s.ref, assign: s.assign ? String(s.assign) : '', args: Array.isArray(s.args) ? s.args.map(String) : [] })),
        result: m.result ? String(m.result) : '',
      });
    }
    const thoughts = [
      ...(thinkingText ? thinkingText.split('\n').filter((l) => l.trim()).slice(0, 3) : []),
      ...(parsed.thoughts || []),
    ].slice(0, 8);

    res.json({ success: true, module: spec.module, selected, macros, thoughts, dropped: { selected: droppedSel, macros: droppedMac } });
  } catch (err) {
    console.error('[/api/abstract-library]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. AI Chat: general-purpose MiniMax chat for the AI Agent panel ──────────
app.post('/api/ai-chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  if (MINIMAX_KEYS.length === 0) {
    return res.status(503).json({ error: 'No MiniMax API keys configured.' });
  }

  try {
    const client = createMiniMaxClient();
    const response = await client.messages.create({
      model: MINIMAX_MODEL,
      max_tokens: 3000,
      system: systemPrompt || 'You are BlockPy AI – a helpful coding assistant for the BlockPy visual Python playground. When asked to write code, output only clean Python that can be visually represented as blocks.',
      messages
    });

    let thinking = '';
    let text = '';
    for (const block of response.content) {
      if (block.type === 'thinking') thinking += block.thinking;
      else if (block.type === 'text') text += block.text;
    }

    res.json({ success: true, thinking, text, model: MINIMAX_MODEL });
  } catch (err) {
    console.error('[/api/ai-chat] MiniMax error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
// ── Real Python execution in a local shell ──────────────────────────────────────
// Runs the user's code with the machine's actual Python (real cv2, real webcam, real
// imshow windows on the user's desktop). Streams stdout/stderr back live; aborting the
// request (Stop) kills the process. Intended for local single-user use.

app.post('/api/run-python', (req, res) => {
  const code = (req.body && req.body.code) || '';
  if (!code.trim()) { res.status(400).json({ error: 'No code provided' }); return; }

  const file = path.join(os.tmpdir(), `blockpy_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  try { fs.writeFileSync(file, code, 'utf8'); }
  catch (e) { res.status(500).json({ error: 'Failed to write temp file: ' + e.message }); return; }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering for live streaming

  let child;
  try {
    child = spawn(PYTHON_CMD, ['-u', file], {
      cwd: MEDIA_DIR, // so cv2.imread('name.jpg') finds uploaded/sample images
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });
  } catch (e) {
    res.write(`[shell error] could not start "${PYTHON_CMD}": ${e.message}\n`);
    try { fs.unlinkSync(file); } catch (_) {}
    res.end();
    return;
  }

  let done = false;
  const cleanup = () => { try { fs.unlinkSync(file); } catch (_) {} };

  child.stdout.on('data', (d) => res.write(d));
  child.stderr.on('data', (d) => res.write(d));
  child.on('error', (e) => {
    res.write(`\n[shell error] ${e.message}\n`);
    if (e.code === 'ENOENT') {
      res.write(`[shell] Python not found. Install Python (and opencv-python) or set PYTHON_CMD.\n`);
    }
  });
  child.on('close', (codeNum) => {
    done = true;
    res.write(`\n[exit ${codeNum}]\n`);
    cleanup();
    res.end();
  });

  // Browser aborted (Stop) → kill the Python process. Only kill on a genuine client
  // disconnect: res 'close' BEFORE the response finished normally (res.end not called).
  // Guarding on res.writableEnded avoids killing on normal completion or proxy quirks.
  res.on('close', () => {
    cleanup();
    if (!done && !res.writableEnded && child && !child.killed) {
      try { child.kill(); } catch (_) {}
    }
  });
});

// Real `pip install <package>` on the local machine (python -m pip). Streams output;
// installed packages become available to subsequent shell runs. spawn (no shell) +
// charset validation prevents command injection.
app.post('/api/pip-install', (req, res) => {
  const pkg = ((req.body && req.body.package) || '').trim();
  if (!pkg) { res.status(400).json({ error: 'package required' }); return; }
  if (!/^[A-Za-z0-9._\-=<>!\[\],~+ ]+$/.test(pkg)) {
    res.status(400).json({ error: 'invalid package spec' }); return;
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  // Split on whitespace so "numpy pillow" or "pkg==1.2" both work; each token is a
  // separate arg (no shell interpolation).
  const args = ['-m', 'pip', 'install', ...pkg.split(/\s+/).filter(Boolean)];
  let child;
  try {
    child = spawn(PYTHON_CMD, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  } catch (e) {
    res.write(`[pip error] ${e.message}\n`); res.end(); return;
  }
  let done = false;
  child.stdout.on('data', (d) => res.write(d));
  child.stderr.on('data', (d) => res.write(d));
  child.on('error', (e) => res.write(`\n[pip error] ${e.message}\n`));
  child.on('close', (codeNum) => { done = true; res.write(`\n[pip exit ${codeNum}]\n`); res.end(); });
  res.on('close', () => { if (!done && !res.writableEnded && child && !child.killed) { try { child.kill(); } catch (_) {} } });
});

// Save an uploaded image to the media dir so shell-run Python can cv2.imread() it.
app.post('/api/upload-image', (req, res) => {
  const { filename, dataBase64 } = req.body || {};
  if (!filename || !dataBase64) { res.status(400).json({ error: 'filename and dataBase64 required' }); return; }
  // sanitize filename to a basename (no path traversal)
  const safe = path.basename(String(filename)).replace(/[^\w.\-]/g, '_') || 'upload.png';
  try {
    const bytes = Buffer.from(String(dataBase64).replace(/^data:[^,]+,/, ''), 'base64');
    fs.writeFileSync(path.join(MEDIA_DIR, safe), bytes);
    res.json({ ok: true, savedAs: safe, dir: MEDIA_DIR });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save image: ' + e.message });
  }
});

// ─── Workspace file system API (the VS Code-style file explorer) ────────────────
// All paths are RELATIVE to WORKSPACE_DIR and validated by safeResolve (no traversal).
// Read-only static mount so the frontend can preview images: GET /workspace/<relpath>.
app.use('/workspace', express.static(WORKSPACE_DIR));

const TEXT_EXT = new Set(['.py','.txt','.md','.json','.csv','.html','.css','.js','.xml','.yml','.yaml','.ini','.cfg','.log','.tsv']);
const IMAGE_EXT = new Set(['.png','.jpg','.jpeg','.gif','.bmp','.webp','.svg']);

function buildTree(absDir, relDir, depth) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { return out; }
  // Folders first, then files; both alphabetical (case-insensitive).
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  for (const e of entries) {
    if (e.name === '.git' || e.name === '__pycache__') continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      out.push({ name: e.name, path: rel, type: 'dir', children: depth > 0 ? buildTree(abs, rel, depth - 1) : [] });
    } else {
      const ext = path.extname(e.name).toLowerCase();
      let size = 0; try { size = fs.statSync(abs).size; } catch (_) {}
      out.push({ name: e.name, path: rel, type: 'file', ext, size, kind: IMAGE_EXT.has(ext) ? 'image' : TEXT_EXT.has(ext) ? 'text' : 'binary' });
    }
  }
  return out;
}

app.get('/api/fs/root', (req, res) => {
  res.json({ root: WORKSPACE_DIR });
});

app.get('/api/fs/tree', (req, res) => {
  res.json({ root: WORKSPACE_DIR, tree: buildTree(WORKSPACE_DIR, '', 12) });
});

app.get('/api/fs/file', (req, res) => {
  const abs = safeResolve(req.query.path);
  if (!abs) return res.status(400).json({ error: 'invalid path' });
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return res.status(404).json({ error: 'not found' });
  const ext = path.extname(abs).toLowerCase();
  if (IMAGE_EXT.has(ext)) {
    // Images are previewed via the /workspace static mount, not inlined here.
    return res.json({ path: req.query.path, kind: 'image', url: '/workspace/' + String(req.query.path).replace(/\\/g, '/') });
  }
  try {
    const content = fs.readFileSync(abs, 'utf8');
    res.json({ path: req.query.path, kind: 'text', content });
  } catch (e) {
    res.status(500).json({ error: 'read failed: ' + e.message });
  }
});

app.post('/api/fs/file', (req, res) => {
  const abs = safeResolve(req.body && req.body.path);
  if (!abs) return res.status(400).json({ error: 'invalid path' });
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, String((req.body && req.body.content) || ''), 'utf8');
    res.json({ ok: true, path: req.body.path });
  } catch (e) {
    res.status(500).json({ error: 'write failed: ' + e.message });
  }
});

app.post('/api/fs/mkdir', (req, res) => {
  const abs = safeResolve(req.body && req.body.path);
  if (!abs) return res.status(400).json({ error: 'invalid path' });
  try { fs.mkdirSync(abs, { recursive: true }); res.json({ ok: true, path: req.body.path }); }
  catch (e) { res.status(500).json({ error: 'mkdir failed: ' + e.message }); }
});

app.post('/api/fs/delete', (req, res) => {
  const abs = safeResolve(req.body && req.body.path);
  if (!abs) return res.status(400).json({ error: 'invalid path' });
  if (abs === path.resolve(WORKSPACE_DIR)) return res.status(400).json({ error: 'cannot delete the workspace root' });
  try { fs.rmSync(abs, { recursive: true, force: true }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'delete failed: ' + e.message }); }
});

app.post('/api/fs/rename', (req, res) => {
  const from = safeResolve(req.body && req.body.from);
  const to = safeResolve(req.body && req.body.to);
  if (!from || !to) return res.status(400).json({ error: 'invalid path' });
  try { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(from, to); res.json({ ok: true, path: req.body.to }); }
  catch (e) { res.status(500).json({ error: 'rename failed: ' + e.message }); }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: MINIMAX_MODEL,
    baseURL: 'https://api.minimax.io/anthropic',
    keysLoaded: MINIMAX_KEYS.length,
    keyPool: MINIMAX_KEYS.map((_, i) => `MINIMAX${i + 1}`)
  });
});

// ─── SPA fallback (only when serving a static frontend) ─────────────────────────
// Any non-/api GET that didn't match a static file returns index.html so client-side
// routing / direct loads work. Registered last so it never shadows the API routes.
// (Avoids Express 5 path-to-regexp wildcard syntax by using a path-less middleware.)
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

function start(port = process.env.PORT || 3001) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      const actual = server.address().port;
      console.log(`\n🚀 BlockPy Express Server  →  http://localhost:${actual}`);
      console.log(`🤖 AI Engine: MiniMax-M2.7  (via Anthropic SDK)`);
      console.log(`🔑 Key pool: ${MINIMAX_KEYS.length} key(s) loaded (round-robin)`);
      console.log(`📁 Workspace (file explorer + run cwd): ${WORKSPACE_DIR}\n`);
      seedSampleImages();
      seedStarterFile();
      resolve({ server, port: actual });
    });
  });
}

// Run standalone (`node server.js`) → listen immediately. When required by Electron's
// main process, export start() so it can pick a port and await readiness instead.
if (require.main === module) {
  start();
}

module.exports = { app, start };
