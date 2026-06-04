import React, { useState, useEffect, useRef } from 'react';
import BlocklyEditor from './components/BlocklyEditor';
import PythonEditor from './components/PythonEditor';
import Stage from './components/Stage';
import ConsoleLogs from './components/ConsoleLogs';
import VariableWatch from './components/VariableWatch';
import ASTTreeView from './components/ASTTreeView';
import LibraryManager from './components/LibraryManager';
import { runCode, initPyodide, interruptPyodide, pipInstall } from './utils/pyodideRunner';

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
  const [isPaused, setIsPaused] = useState(false);
  const [runSpeed, setRunSpeed] = useState(50);
  const [highlightedLine, setHighlightedLine] = useState(null);
  
  // Custom Abstract blocks and thoughts
  const [installedBlocks, setInstalledBlocks] = useState([]);
  const [aiThoughts, setAiThoughts] = useState([]);
  const [isAbstracting, setIsAbstracting] = useState(false);

  // Pyodide state
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);

  // Synced status state
  const [syntaxStatus, setSyntaxStatus] = useState({ valid: true, error: '' });
  const [shouldDesugar, setShouldDesugar] = useState(true);

  // Tabs layout variables
  const [activeEditorTab, setActiveEditorTab] = useState('blockly');
  const [activeAuxTab, setActiveAuxTab] = useState('variables');
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  // Synchronization refs
  const workspaceRef = useRef(null);
  const isSyncingFromCodeRef = useRef(false);
  const blocklySnapshotRef = useRef(null);
  const associatedPythonRef = useRef('');
  const interpreterRef = useRef(null);
  const abstractionEngineRef = useRef(null);

  // Structural script equivalence helper
  const arePythonScriptsEquivalent = (codeA, codeB) => {
    const clean = (c) => c.replace(/#.*$/gm, '')
                          .replace(/\s+/g, ' ')
                          .trim();
    return clean(codeA) === clean(codeB);
  };

  // Compile Python to Blockly blocks
  const syncCodeToBlocks = (currentCode) => {
    if (!currentCode.trim() || currentCode.startsWith('# Start dragging')) return;
    if (!workspaceRef.current) return;

    isSyncingFromCodeRef.current = true;

    try {
      // Snapshot Recovery Check
      if (blocklySnapshotRef.current && arePythonScriptsEquivalent(currentCode, associatedPythonRef.current)) {
        window.Blockly.serialization.workspaces.load(blocklySnapshotRef.current, workspaceRef.current);
        setLogs(prev => [...prev, '[Sync-Engine] Python matches active snapshot. Restored layout without block drift.']);
        setSyntaxStatus({ valid: true, error: '' });
        isSyncingFromCodeRef.current = false;
        return;
      }

      // Compile, desugaring only when the "Auto Desugar" toggle is on.
      // Desugar off → advanced syntax keeps its dedicated blocks (ternary, list comp).
      let parsedAST = null;
      if (shouldDesugar) {
        const result = window.BlockPyDesugarer.desugarPythonCode(currentCode);
        if (!result.success) {
          throw new SyntaxError(result.error);
        }
        parsedAST = result.desugaredAST;
      } else {
        const lexer = new window.BlockPyParser.Tokenizer(currentCode);
        const tokens = lexer.tokenize();
        const parser = new window.BlockPyParser.Parser(tokens);
        parsedAST = parser.parse();
      }

      const blocklyJson = window.BlockPyParser.astToBlockly(parsedAST);
      window.Blockly.serialization.workspaces.load(blocklyJson, workspaceRef.current);

      // Pick up any dynamic library blocks the parser auto-registered during astToBlockly.
      const engine = abstractionEngineRef.current;
      if (engine && engine.activeBlocks && engine.activeBlocks.length > 0) {
        setInstalledBlocks((prev) => {
          const known = new Set(prev.map((p) => p.type));
          const added = engine.activeBlocks.filter((b) => !known.has(b.type));
          return added.length ? [...prev, ...added] : prev;
        });
      }

      blocklySnapshotRef.current = window.Blockly.serialization.workspaces.save(workspaceRef.current);
      associatedPythonRef.current = currentCode;

      setLogs(prev => [...prev, `[Sync-Engine] Successfully parsed Python AST. Desugared = ${shouldDesugar}.`]);
      setSyntaxStatus({ valid: true, error: '' });
    } catch (err) {
      console.error(err);
      setLogs(prev => [...prev, `[Parser Error] ${err.message}`]);
      setSyntaxStatus({ valid: false, error: err.message });
    } finally {
      isSyncingFromCodeRef.current = false;
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

  // Pre-load interpreter and standard OpenCV blocks
  useEffect(() => {
    // Initialize custom interpreter
    interpreterRef.current = new window.BlockPyInterpreter.ASTInterpreter({
      onLog: (msg) => {
        setLogs(prev => [...prev, msg]);
      },
      onVarUpdate: (vars) => {
        setVariables({ ...vars });
      },
      onSpriteCommand: (cmd, state) => {
        setSpriteState({
          x: state.x,
          y: state.y,
          angle: state.angle,
          penDown: state.penDown,
          color: state.color,
          sayBubble: state.sayBubble
        });
        if (cmd === 'move' && state.penDown) {
          setDrawnLines(prev => [...prev, {
            x1: state.oldX,
            y1: state.oldY,
            x2: state.newX,
            y2: state.newY,
            color: state.color
          }]);
        }
      },
      onHighlightLine: (line) => {
        setHighlightedLine(line);
      },
      onCv2Action: handleCv2Action,
    });

    // Populate preloaded blocks for OpenCV Visual Palette Parity
    const cv2Preset = window.BlockPyAbstraction.AI_PRESETS['cv2'];
    {
      // Persistent abstraction engine — shared with the parser (window.__blockpyEngine)
      // for on-the-fly dynamic-block registration during Convert.
      const engine = new window.BlockPyAbstraction.LibraryAbstractionEngine(null);
      abstractionEngineRef.current = engine;
      window.__blockpyEngine = engine;
    }
    if (cv2Preset) {
      const engine = abstractionEngineRef.current;
      const preloaded = cv2Preset.blocks.map(b => {
        const blockType = engine.registerBlock('cv2', b.func, b.args, b.hasOutput, b.colour, b.title);
        return {
          type: blockType,
          title: b.title,
          hasOutput: b.hasOutput,
          func: b.func,
          args: b.args,
          colour: b.colour
        };
      });
      setInstalledBlocks(preloaded);
    }

    // Load initial glowing star demo script
    loadDemoScript('star');

    return () => {
      if (interpreterRef.current) {
        interpreterRef.current.reset();
      }
    };
  }, []);

  // Update dynamic toolbox XML when blocks list updates
  useEffect(() => {
    if (workspaceRef.current && installedBlocks.length > 0) {
      const toolboxXml = document.getElementById('toolbox');
      if (!toolboxXml) return;

      const category = toolboxXml.querySelector('#abstract-lib-category');
      if (!category) return;

      category.style.display = 'block';
      category.removeAttribute('style');

      category.innerHTML = '';
      installedBlocks.forEach(b => {
        const blockNode = document.createElement('block');
        blockNode.setAttribute('type', b.type);
        category.appendChild(blockNode);
      });

      workspaceRef.current.updateToolbox(toolboxXml);
    }
  }, [installedBlocks, workspaceRef.current]);

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

  // ── Run: Pyodide real Python execution ────────────────────────────────────────
  const handleRunExecution = async () => {
    if (isPaused) {
      // Step-mode resume still uses JS interpreter
      setIsPaused(false);
      interpreterRef.current.runExecution(() => runSpeed, (err) => handleExecutionFinish(err));
      setLogs(prev => [...prev, '[Interpreter] Resuming step execution.']);
      return;
    }

    setDrawnLines([]);
    setHighlightedLine(null);
    setVariables({});
    setIsRunning(true);
    setIsPaused(false);
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
      onComplete: (err) => {
        setPyodideLoading(false);
        setPyodideReady(true);
        setIsRunning(false);
        setIsPaused(false);
        setHighlightedLine(null);
        if (!err) {
          setLogs(prev => [...prev, '[Python] Execution completed.']);
        }
      }
    });
  };

  // ── Pause: only applies to JS step-mode ───────────────────────────────────────
  const handlePauseExecution = () => {
    if (interpreterRef.current) {
      interpreterRef.current.pauseExecution();
      setIsPaused(true);
      setLogs(prev => [...prev, '[Interpreter] Paused.']);
    }
  };

  // ── Step: still uses JS interpreter for line-by-line ─────────────────────────
  const handleStepExecution = () => {
    if (!isRunning) {
      try {
        const lexer = new window.BlockPyParser.Tokenizer(code);
        const tokens = lexer.tokenize();
        const parser = new window.BlockPyParser.Parser(tokens);
        const ast = parser.parse();
        let finalAST = ast;
        if (shouldDesugar) {
          const desugarer = new window.BlockPyDesugarer.ASTDesugarer();
          finalAST = desugarer.desugar(ast);
        }
        setDrawnLines([]);
        setHighlightedLine(null);
        setVariables({});
        setLogs(['[Step] Initializing step debugger...']);
        interpreterRef.current.initProgram(finalAST);
        setIsRunning(true);
        setIsPaused(true);
      } catch (err) {
        setLogs(prev => [...prev, `[Step Error] ${err.message}`]);
        return;
      }
    }
    const res = interpreterRef.current.stepExecution();
    if (res.done) handleExecutionFinish(res.error);
  };

  // ── Stop: interrupt Pyodide + reset JS interpreter ────────────────────────────
  const handleStopExecution = () => {
    interruptPyodide();
    if (interpreterRef.current) interpreterRef.current.reset();
    setHighlightedLine(null);
    setIsRunning(false);
    setIsPaused(false);
    setSpriteState({ x: 240, y: 140, angle: 0, penDown: false, color: '#a855f7', sayBubble: null });
    setLogs(prev => [...prev, '[Python] Stopped.']);
  };

  const handleExecutionFinish = (err) => {
    setIsRunning(false);
    setIsPaused(false);
    setHighlightedLine(null);
    if (err) {
      setLogs(prev => [...prev, `[Runtime Error] ${err.message}`]);
    } else {
      setLogs(prev => [...prev, '[Interpreter] Program execution completed successfully.']);
    }
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
    setLogs(prev => [...prev, `[AI Agent] Calling MiniMax-M2.7 to abstract library: "${libKey}"...`]);

    try {
      // Call real MiniMax backend
      const response = await fetch('/api/ai-abstract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libName: libKey, customCode })
      });

      const data = await response.json();

      if (!data.success) {
        setLogs(prev => [...prev, `[AI Agent Error] ${data.error}`]);
        setIsAbstracting(false);
        return;
      }

      const libName = data.libName || libKey;

      // Reveal thoughts one-by-one for dramatic streaming effect
      const thoughts = data.thoughts || [];
      const revealed = [];
      for (const thought of thoughts) {
        revealed.push(thought);
        setAiThoughts([...revealed]);
        await new Promise(resolve => setTimeout(resolve, 420));
      }

      // Register blocks into workspace
      const engine = new window.BlockPyAbstraction.LibraryAbstractionEngine(workspaceRef.current);
      const registeredBlocks = [];

      (data.blocks || []).forEach(b => {
        const typeName = engine.registerBlock(libName, b.func, b.args, b.hasOutput, b.colour, b.title);
        registeredBlocks.push({
          type: typeName,
          title: b.title,
          hasOutput: b.hasOutput,
          func: b.func,
          args: b.args,
          colour: b.colour
        });
      });

      setInstalledBlocks(prev => {
        const filtered = prev.filter(p => !registeredBlocks.some(r => r.type === p.type));
        return [...filtered, ...registeredBlocks];
      });

      setLogs(prev => [...prev,
        `[MiniMax] ✅ Registered ${registeredBlocks.length} dynamic blocks for "${libName}".`
      ]);
    } catch (err) {
      console.error(err);
      setLogs(prev => [...prev, `[AI Agent Error] Network error: ${err.message}`]);
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

  // Theme Toggler
  const toggleTheme = () => {
    setIsDarkTheme(!isDarkTheme);
    document.body.classList.toggle('light-theme');
    
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

  // Get desugared code unrolled text
  const desugaredResult = window.BlockPyDesugarer ? window.BlockPyDesugarer.desugarPythonCode(code) : { success: false };
  let explanationHtml = 'No advanced syntax sugar detected in active code lines. Standing by...';
  if (code.includes('[') && code.includes('for') && code.includes('in') && code.includes(']')) {
    explanationHtml = 'List Comprehension unrolled! Pre-declares lists and injects append statements before iterating.';
  } else if (code.includes('if') && code.includes('else') && !code.includes(':')) {
    explanationHtml = 'Ternary unrolled! Extracted inline ternary assignment to complete structural branch blocks.';
  } else if (/(<=|>=|<|>).*(<=|>=|<|>)/.test(code)) {
    explanationHtml = 'Chained comparison split! Rewritten into dual comparisons chained with "and".';
  }

  return (
    <div className="harness-container">
      {/* 1. Header Bar */}
      <header className="header-bar">
        <div className="brand-group">
          <div className="logo-glow">
            <i className="fa-solid fa-cube logo-icon"></i>
          </div>
          <div className="brand-text">
            <h1>BlockPy Dashboard</h1>
            <p>1:1 Bidirectional Lossless Parser Playground</p>
          </div>
        </div>
        
        {/* Presets and template buttons */}
        <div className="templates-bar">
          <button className="btn btn-secondary btn-sm" onClick={() => loadDemoScript('star')}>
            <i className="fa-solid fa-star icon-yellow"></i> Glowing Star
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => loadDemoScript('opencv')}>
            <i className="fa-solid fa-video icon-cyan"></i> OpenCV Stream
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => loadDemoScript('listcomp')}>
            <i className="fa-solid fa-list-check icon-green"></i> List Comp
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => loadDemoScript('ternary')}>
            <i className="fa-solid fa-code-branch icon-pink"></i> Ternary
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => loadDemoScript('chained')}>
            <i className="fa-solid fa-link icon-blue"></i> Chained Comp
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => loadDemoScript('augmented')}>
            <i className="fa-solid fa-plus-minus icon-orange"></i> Aug Assign
          </button>
        </div>

        {/* Global actions badges and theme togglers */}
        <div className="header-actions">
          <div className="toggle-group">
            <label htmlFor="toggle-desugar">Auto Desugar</label>
            <input 
              type="checkbox" 
              id="toggle-desugar" 
              checked={shouldDesugar}
              onChange={(e) => setShouldDesugar(e.target.checked)}
            />
          </div>
          <button 
            id="theme-toggle"
            className="btn btn-secondary btn-icon-only theme-btn"
            onClick={toggleTheme}
            title="Toggle theme styling"
          >
            <i className={isDarkTheme ? "fa-solid fa-moon" : "fa-solid fa-sun"}></i>
          </button>
        </div>
      </header>

      {/* 2. Main Dashboard Layout grid */}
      <main className="dashboard-grid">
        {/* Left Side Panels: Stage, console, scopes, abstractions */}
        <section className="left-panel">
          <Stage
            spriteState={spriteState}
            drawnLines={drawnLines}
            isRunning={isRunning}
            isPaused={isPaused}
            onRun={handleRunExecution}
            onPause={handlePauseExecution}
            onStep={handleStepExecution}
            onStop={handleStopExecution}
            onClearCanvas={() => setDrawnLines([])}
            runSpeed={runSpeed}
            onSpeedChange={setRunSpeed}
          />

          {/* Auxiliary Tabs pane */}
          <div className="tab-card">
            <div className="tab-header">
              <button 
                id="tab-btn-variables"
                className={`tab-btn ${activeAuxTab === 'variables' ? 'active' : ''}`}
                onClick={() => setActiveAuxTab('variables')}
              >
                Variables Watch
              </button>
              <button 
                id="tab-btn-logs"
                className={`tab-btn ${activeAuxTab === 'logs' ? 'active' : ''}`}
                onClick={() => setActiveAuxTab('logs')}
              >
                Logs Terminal
              </button>
              <button 
                id="tab-btn-ai"
                className={`tab-btn ${activeAuxTab === 'ai' ? 'active' : ''}`}
                onClick={() => setActiveAuxTab('ai')}
              >
                AI Abstractions
              </button>
            </div>
            <div className="tab-content-wrapper">
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
                <LibraryManager
                  onAbstract={handleAbstractLibrary}
                  onPipInstall={handlePipInstall}
                  installedBlocks={installedBlocks}
                  aiThoughts={aiThoughts}
                  isAbstracting={isAbstracting}
                  pyodideReady={pyodideReady}
                  pyodideLoading={pyodideLoading}
                />
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
                          {desugaredResult.success ? desugaredResult.desugaredPython : '# No changes required.'}
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
