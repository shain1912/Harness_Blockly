/* app.js - Main UI coordination, Blockly Mounting, Stage Visuals & Sync-Engine */

class AppOrchestrator {
  constructor() {
    window.appOrchestrator = this; // Ensure global reference is assigned immediately for parsing
    this.workspace = null;
    this.interpreter = null;
    this.abstractionEngine = null;
    
    // Snapshot recovery state
    this.blocklySnapshot = null;
    this.associatedPython = '';
    
    // Canvas sprite drawings
    this.drawnLines = []; // { x1, y1, x2, y2, color }
    this.canvasWidth = 480;
    this.canvasHeight = 280;
    
    // Theme
    this.isDarkTheme = true;
    
    this.init();
  }

  init() {
    // 1. Mount Blockly
    this.mountBlockly();

    // 2. Initialize Engines
    this.interpreter = new window.BlockPyInterpreter.ASTInterpreter({
      onLog: (msg) => this.writeToConsole(msg),
      onVarUpdate: (vars) => this.updateVariablesWatch(vars),
      onSpriteCommand: (cmd, state) => this.handleSpriteCommand(cmd, state),
      onHighlightLine: (line) => this.highlightEditorLine(line)
    });

    this.abstractionEngine = new window.BlockPyAbstraction.LibraryAbstractionEngine(
      this.workspace,
      (msg) => this.writeToConsole(msg)
    );

    // Pre-register OpenCV (cv2) blocks silently on startup for instant palette parity!
    const cv2Preset = window.BlockPyAbstraction.AI_PRESETS['cv2'];
    if (cv2Preset) {
      cv2Preset.blocks.forEach(b => {
        this.abstractionEngine.registerBlock('cv2', b.func, b.args, b.hasOutput, b.colour, b.title);
        this.abstractionEngine.activeBlocks.push({
          type: `lib_cv2_${b.func}`,
          title: b.title,
          hasOutput: b.hasOutput
        });
      });
      this.abstractionEngine.installedBlocksCount += cv2Preset.blocks.length;
      
      // Update badge and list in DOM
      const badgeCount = document.getElementById('dynamic-blocks-count');
      if (badgeCount) {
        badgeCount.innerText = `${this.abstractionEngine.installedBlocksCount} Blocks Installed`;
      }
      const blocksList = document.getElementById('dynamic-blocks-list');
      if (blocksList) {
        blocksList.innerHTML = '';
        this.abstractionEngine.activeBlocks.forEach(b => {
          const pill = document.createElement('div');
          pill.className = 'dyn-block-pill';
          pill.innerHTML = `
            <span class="dyn-block-name">${b.title}</span>
            <span class="dyn-block-type">${b.hasOutput ? 'Output Block' : 'Statement Block'}</span>
          `;
          blocksList.appendChild(pill);
        });
      }
      this.abstractionEngine.updateBlocklyToolbox();
    }

    // 3. Setup UI Event Listeners
    this.setupUIEventListeners();

    // 4. Load Initial Demo Script
    this.loadDemoScript('star');

    // 5. Start Canvas Animation Loop
    this.startCanvasAnimationLoop();
  }

  // -------------------------------------------------------------
  // 1. Blockly Mounting & Theme Customizations
  // -------------------------------------------------------------
  mountBlockly() {
    const blocklyDiv = document.getElementById('blockly-div');
    const toolbox = document.getElementById('toolbox');

    // Clean up any existing workspace to avoid StrictMode double renders
    if (window.__blocklyWorkspace) {
      window.__blocklyWorkspace.dispose();
    }

    this.workspace = Blockly.inject(blocklyDiv, {
      toolbox: toolbox,
      theme: this.getBlocklyDarkTheme(),
      renderer: 'geras',
      grid: {
        spacing: 20,
        length: 3,
        colour: 'rgba(255, 255, 255, 0.05)',
        snap: true
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.85,
        maxScale: 3,
        minScale: 0.3,
        scaleSpeed: 1.2
      },
      trashcan: true
    });

    window.__blocklyWorkspace = this.workspace;

    // Listen to block events for real-time translation and snapshot updates!
    this.workspace.addChangeListener((event) => {
      // Avoid loops when we are programmatically updating the workspace from code
      if (this.isSyncingFromCode) return;
      
      if (event.type === Blockly.Events.BLOCK_CREATE ||
          event.type === Blockly.Events.BLOCK_DELETE ||
          event.type === Blockly.Events.BLOCK_CHANGE ||
          event.type === Blockly.Events.BLOCK_MOVE) {
        
        this.syncBlocksToCode();
      }
    });
  }

  getBlocklyDarkTheme() {
    return Blockly.Theme.defineTheme('cyber_dark', {
      'base': Blockly.Themes.Classic,
      'componentStyles': {
        'workspaceBackgroundColour': '#0c0f1b',
        'toolboxBackgroundColour': '#0e1220',
        'toolboxTextColour': '#94a3b8',
        'flyoutBackgroundColour': '#0e1220',
        'flyoutTextColour': '#94a3b8',
        'scrollbarColour': '#64748b',
        'scrollbarOpacity': 0.4
      },
      'blockStyles': {
        'logic_blocks': { 'colourPrimary': '#5b80a5' },
        'loop_blocks': { 'colourPrimary': '#5ba55b' },
        'math_blocks': { 'colourPrimary': '#5b67a5' },
        'text_blocks': { 'colourPrimary': '#5ba5a5' },
        'list_blocks': { 'colourPrimary': '#745ba5' },
        'variable_blocks': { 'colourPrimary': '#a55b80' }
      }
    });
  }

  // -------------------------------------------------------------
  // 2. Synchronize Blockly -> Python Source Code
  // -------------------------------------------------------------
  syncBlocksToCode() {
    try {
      // 1. Generate Python Code from Blockly blocks
      let code = Blockly.Python.workspaceToCode(this.workspace);
      
      // Clean leading/trailing spaces
      if (!code.trim()) {
        code = '# Start dragging blocks here to generate Python code...';
      }

      // 2. Update the Textarea
      const editor = document.getElementById('python-code');
      editor.value = code;
      
      // Update line numbers count
      this.updateLineNumbers(code);

      // 3. Save snapshot for roundtrip preservation!
      this.blocklySnapshot = Blockly.serialization.workspaces.save(this.workspace);
      this.associatedPython = code;

      // Update UI Status Indicators
      document.getElementById('sync-indicator').innerHTML = '<i class="fa-solid fa-rotate"></i> Synchronized';
      document.getElementById('sync-indicator').className = 'badge badge-success';
      this.updateSyntaxStatus(true);
      
      // Update AST Tree live!
      this.updateASTVisualTree(code);
      this.updateDesugarerPreview(code);

    } catch (err) {
      console.error(err);
      this.writeToConsole(`[Sync Error] ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // 3. Synchronize Python Source Code -> Blockly (Snapshot + AST Parser)
  // -------------------------------------------------------------
  syncCodeToBlocks() {
    const code = document.getElementById('python-code').value;
    
    // Ignore empty code
    if (!code.trim() || code.startsWith('# Start dragging')) return;

    this.isSyncingFromCode = true;
    
    try {
      // A. SNAPSHOT RECOVERY PATTERN (Requirement 1)
      // Check if Python text matches the snapshot's generated Python (structural check ignoring spacing)
      if (this.blocklySnapshot && this.arePythonScriptsEquivalent(code, this.associatedPython)) {
        // Perfect Match! Restore coordinate positioning exactly!
        Blockly.serialization.workspaces.load(this.blocklySnapshot, this.workspace);
        
        document.getElementById('sync-indicator').innerHTML = '<i class="fa-solid fa-rotate-left"></i> Restored (Snapshot)';
        document.getElementById('sync-indicator').className = 'badge badge-success';
        this.writeToConsole('[Sync-Engine] Python matches active snapshot. Restored layout without block drift.');
        this.updateSyntaxStatus(true);
        this.isSyncingFromCode = false;
        
        // Update auxiliary cards
        this.updateASTVisualTree(code);
        this.updateDesugarerPreview(code);
        return;
      }

      // B. COMPILE & DESUGAR RUNTIME (Requirements 3, 4 & 5)
      // If code was changed, parse it at AST level, desugar syntactic sugar, and rebuild
      // Convert ALWAYS desugars — checkbox only affects the Desugarer view panel.
      let parsedAST = null;
      let desugaredPython = code;

      const result = window.BlockPyDesugarer.desugarPythonCode(code);
      if (!result.success) {
        throw new SyntaxError(result.error);
      }
      parsedAST = result.desugaredAST;
      desugaredPython = result.desugaredPython;

      // Map AST down to Blockly JSON blocks
      const blocklyJson = window.BlockPyParser.astToBlockly(parsedAST);
      
      // Load blocks into workspace
      Blockly.serialization.workspaces.load(blocklyJson, this.workspace);

      // Save as new active snapshot
      this.blocklySnapshot = Blockly.serialization.workspaces.save(this.workspace);
      this.associatedPython = code;

      document.getElementById('sync-indicator').innerHTML = '<i class="fa-solid fa-code"></i> Parsed AST';
      document.getElementById('sync-indicator').className = 'badge badge-purple';
      this.writeToConsole(`[Sync-Engine] Successfully parsed Python AST. Desugared = true (always-on for Convert).`);
      this.updateSyntaxStatus(true);

      // Update AST Tree live!
      this.updateASTVisualTree(code);
      this.updateDesugarerPreview(code);

    } catch (err) {
      console.error(err);
      this.writeToConsole(`[Parser Error] ${err.message}`);
      this.updateSyntaxStatus(false, err.message);
      
      document.getElementById('sync-indicator').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Parsing Failed';
      document.getElementById('sync-indicator').className = 'badge';
    } finally {
      this.isSyncingFromCode = false;
    }
  }

  // Structural equivalence helper: ignores comments, spacing, and trailing lines
  arePythonScriptsEquivalent(codeA, codeB) {
    const clean = (c) => c.replace(/#.*$/gm, '') // delete comments
                          .replace(/\s+/g, ' ')  // squash whitespaces
                          .trim();
    return clean(codeA) === clean(codeB);
  }

  // -------------------------------------------------------------
  // 4. Interactive AST tree explorer rendering
  // -------------------------------------------------------------
  updateASTVisualTree(code) {
    const treeView = document.getElementById('ast-tree-view');
    
    try {
      const lexer = new window.BlockPyParser.Tokenizer(code);
      const tokens = lexer.tokenize();
      const parser = new window.BlockPyParser.Parser(tokens);
      const ast = parser.parse();

      treeView.innerHTML = '';
      const rootEl = this.createASTNodeElement(ast);
      treeView.appendChild(rootEl);
    } catch (err) {
      // Keep previous tree or show mini placeholder if empty
      if (!treeView.hasChildNodes()) {
        treeView.innerHTML = `<div class="tree-placeholder error">AST Parsing error: ${err.message}</div>`;
      }
    }
  }

  createASTNodeElement(node) {
    if (!node) return document.createElement('div');

    const nodeEl = document.createElement('div');
    nodeEl.className = 'ast-node';

    const header = document.createElement('div');
    header.className = 'ast-node-header';
    header.title = `Line ${node.line}`;

    const toggle = document.createElement('span');
    toggle.className = 'ast-toggle';
    
    const typeSpan = document.createElement('span');
    typeSpan.className = 'ast-type';
    typeSpan.innerText = node.type;

    // Gather node attributes depending on type
    const details = document.createElement('span');
    details.className = 'ast-details';

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'ast-node-children';

    let hasChildren = false;

    // Node-specific rendering configurations
    switch (node.type) {
      case 'Program':
        hasChildren = node.body && node.body.length > 0;
        if (hasChildren) {
          node.body.forEach(stmt => {
            childrenContainer.appendChild(this.createASTNodeElement(stmt));
          });
        }
        break;

      case 'Assign':
        hasChildren = true;
        details.innerHTML = ' <span class="ast-prop">target=</span>';
        details.appendChild(this.createASTNodeElement(node.target));
        details.innerHTML += ' <span class="ast-prop">value=</span>';
        childrenContainer.appendChild(this.createASTNodeElement(node.value));
        break;

      case 'AugAssign':
        details.innerHTML = ` <span class="ast-prop">target=</span><span class="ast-val">${node.target.id}</span> <span class="ast-prop">op=</span><span class="ast-val">${node.op}</span>`;
        hasChildren = true;
        childrenContainer.appendChild(this.createASTNodeElement(node.value));
        break;

      case 'For':
        hasChildren = true;
        details.innerHTML = ` <span class="ast-prop">target=</span><span class="ast-val">${node.target.id}</span>`;
        
        const iterNode = document.createElement('div');
        iterNode.className = 'ast-node';
        iterNode.innerHTML = '<span class="ast-prop">iter=</span>';
        iterNode.appendChild(this.createASTNodeElement(node.iter));
        childrenContainer.appendChild(iterNode);

        const bodyNode = document.createElement('div');
        bodyNode.className = 'ast-node';
        bodyNode.innerHTML = '<span class="ast-prop">body=</span>';
        node.body.forEach(stmt => bodyNode.appendChild(this.createASTNodeElement(stmt)));
        childrenContainer.appendChild(bodyNode);
        break;

      case 'While':
        hasChildren = true;
        const testNode = document.createElement('div');
        testNode.className = 'ast-node';
        testNode.innerHTML = '<span class="ast-prop">test=</span>';
        testNode.appendChild(this.createASTNodeElement(node.test));
        childrenContainer.appendChild(testNode);

        const whileBody = document.createElement('div');
        whileBody.className = 'ast-node';
        whileBody.innerHTML = '<span class="ast-prop">body=</span>';
        node.body.forEach(stmt => whileBody.appendChild(this.createASTNodeElement(stmt)));
        childrenContainer.appendChild(whileBody);
        break;

      case 'If':
        hasChildren = true;
        const ifTest = document.createElement('div');
        ifTest.className = 'ast-node';
        ifTest.innerHTML = '<span class="ast-prop">test=</span>';
        ifTest.appendChild(this.createASTNodeElement(node.test));
        childrenContainer.appendChild(ifTest);

        const ifBody = document.createElement('div');
        ifBody.className = 'ast-node';
        ifBody.innerHTML = '<span class="ast-prop">body=</span>';
        node.body.forEach(stmt => ifBody.appendChild(this.createASTNodeElement(stmt)));
        childrenContainer.appendChild(ifBody);

        if (node.orelse && node.orelse.length > 0) {
          const elseBody = document.createElement('div');
          elseBody.className = 'ast-node';
          elseBody.innerHTML = '<span class="ast-prop">orelse=</span>';
          node.orelse.forEach(stmt => elseBody.appendChild(this.createASTNodeElement(stmt)));
          childrenContainer.appendChild(elseBody);
        }
        break;

      case 'Call':
        hasChildren = node.args && node.args.length > 0;
        details.innerHTML = ` <span class="ast-prop">func=</span>`;
        details.appendChild(this.createASTNodeElement(node.func));
        
        if (hasChildren) {
          node.args.forEach((arg, idx) => {
            const argWrap = document.createElement('div');
            argWrap.className = 'ast-node';
            argWrap.innerHTML = `<span class="ast-prop">arg[${idx}]=</span>`;
            argWrap.appendChild(this.createASTNodeElement(arg));
            childrenContainer.appendChild(argWrap);
          });
        }
        break;

      case 'ListComp':
        hasChildren = true;
        details.innerHTML = ` <span class="ast-prop">target=</span><span class="ast-val">${node.target.id}</span>`;
        
        const compElt = document.createElement('div');
        compElt.className = 'ast-node';
        compElt.innerHTML = '<span class="ast-prop">elt=</span>';
        compElt.appendChild(this.createASTNodeElement(node.elt));
        childrenContainer.appendChild(compElt);

        const compIter = document.createElement('div');
        compIter.className = 'ast-node';
        compIter.innerHTML = '<span class="ast-prop">iter=</span>';
        compIter.appendChild(this.createASTNodeElement(node.iter));
        childrenContainer.appendChild(compIter);
        break;

      case 'Ternary':
        hasChildren = true;
        const ternTest = document.createElement('div');
        ternTest.className = 'ast-node';
        ternTest.innerHTML = '<span class="ast-prop">test=</span>';
        ternTest.appendChild(this.createASTNodeElement(node.test));
        childrenContainer.appendChild(ternTest);

        const ternBody = document.createElement('div');
        ternBody.className = 'ast-node';
        ternBody.innerHTML = '<span class="ast-prop">body=</span>';
        ternBody.appendChild(this.createASTNodeElement(node.body));
        childrenContainer.appendChild(ternBody);

        const ternElse = document.createElement('div');
        ternElse.className = 'ast-node';
        ternElse.innerHTML = '<span class="ast-prop">orelse=</span>';
        ternElse.appendChild(this.createASTNodeElement(node.orelse));
        childrenContainer.appendChild(ternElse);
        break;

      case 'Attribute':
        details.innerHTML = ` <span class="ast-prop">value=</span><span class="ast-val">${node.value.id || 'value'}</span> <span class="ast-prop">attr=</span><span class="ast-val string">"${node.attr}"</span>`;
        break;

      case 'Name':
        details.innerHTML = ` <span class="ast-prop">id=</span><span class="ast-val">${node.id}</span>`;
        break;

      case 'Num':
        details.innerHTML = ` <span class="ast-prop">value=</span><span class="ast-val number">${node.value}</span>`;
        break;

      case 'Str':
        details.innerHTML = ` <span class="ast-prop">value=</span><span class="ast-val string">"${node.value}"</span>`;
        break;

      case 'Bool':
        details.innerHTML = ` <span class="ast-prop">value=</span><span class="ast-val">${node.value ? 'True' : 'False'}</span>`;
        break;

      case 'BinOp':
        details.innerHTML = ` <span class="ast-prop">op=</span><span class="ast-val">${node.op}</span>`;
        hasChildren = true;
        if (node.left) {
          const lNode = document.createElement('div');
          lNode.className = 'ast-node';
          lNode.innerHTML = '<span class="ast-prop">left=</span>';
          lNode.appendChild(this.createASTNodeElement(node.left));
          childrenContainer.appendChild(lNode);
        }
        const rNode = document.createElement('div');
        rNode.className = 'ast-node';
        rNode.innerHTML = '<span class="ast-prop">right=</span>';
        rNode.appendChild(this.createASTNodeElement(node.right));
        childrenContainer.appendChild(rNode);
        break;

      case 'Range':
        hasChildren = true;
        const startR = document.createElement('div');
        startR.className = 'ast-node';
        startR.innerHTML = '<span class="ast-prop">start=</span>';
        startR.appendChild(this.createASTNodeElement(node.start));
        childrenContainer.appendChild(startR);

        const stopR = document.createElement('div');
        stopR.className = 'ast-node';
        stopR.innerHTML = '<span class="ast-prop">stop=</span>';
        stopR.appendChild(this.createASTNodeElement(node.stop));
        childrenContainer.appendChild(stopR);
        break;

      case 'Import':
        details.innerHTML = ` <span class="ast-prop">lib=</span><span class="ast-val">${node.names[0].name}</span>`;
        break;
    }

    // Toggle click listeners
    if (hasChildren) {
      toggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = childrenContainer.classList.toggle('collapsed');
        toggle.innerHTML = isCollapsed ? '<i class="fa-solid fa-chevron-right"></i>' : '<i class="fa-solid fa-chevron-down"></i>';
      });
    } else {
      toggle.innerHTML = '<i class="fa-solid fa-circle-notch" style="font-size:0.5rem; opacity:0.3;"></i>';
    }

    header.appendChild(toggle);
    header.appendChild(typeSpan);
    header.appendChild(details);

    // Hover highlights corresponding editor lines
    header.addEventListener('mouseover', (e) => {
      e.stopPropagation();
      header.classList.add('active-highlight');
      this.highlightEditorLine(node.line);
    });
    header.addEventListener('mouseout', (e) => {
      e.stopPropagation();
      header.classList.remove('active-highlight');
      this.clearEditorLineHighlights();
    });

    nodeEl.appendChild(header);
    if (hasChildren) {
      nodeEl.appendChild(childrenContainer);
    }

    return nodeEl;
  }

  // -------------------------------------------------------------
  // 5. AST Desugarer Panel Updates
  // -------------------------------------------------------------
  updateDesugarerPreview(code) {
    const previewText = document.getElementById('desugared-target-code');
    const originalText = document.getElementById('sugar-original-code');
    const explanationText = document.getElementById('desugar-explanation-text');
    
    const result = window.BlockPyDesugarer.desugarPythonCode(code);
    
    if (result.success) {
      previewText.innerText = result.desugaredPython || '# No changes required.';
      originalText.innerText = code;

      // Update explanation dynamically based on detected sugar constructs
      if (code.includes('[') && code.includes('for') && code.includes('in') && code.includes(']')) {
        explanationText.innerHTML = '<i class="fa-solid fa-circle-info"></i> <strong>List Comprehension unrolled!</strong> Pre-declares lists and injects append statements before iterating.';
      } else if (code.includes('if') && code.includes('else') && !code.includes(':')) {
        explanationText.innerHTML = '<i class="fa-solid fa-circle-info"></i> <strong>Ternary unrolled!</strong> Extracted inline ternary assignment to complete structural branch blocks.';
      } else if (/(<=|>=|<|>).*(<=|>=|<|>)/.test(code)) {
        explanationText.innerHTML = '<i class="fa-solid fa-circle-info"></i> <strong>Chained comparison split!</strong> Rewritten into dual comparisons chained with "and".';
      } else {
        explanationText.innerHTML = '<i class="fa-solid fa-circle-info"></i> No advanced syntax sugar detected in active code lines. Standing by...';
      }
    } else {
      previewText.innerText = '# Syntax error in original code...';
    }
  }

  // -------------------------------------------------------------
  // 6. Interactive Canvas Rendering (Spaceship/Turtle graphics)
  // -------------------------------------------------------------
  startCanvasAnimationLoop() {
    const canvas = document.getElementById('stage-canvas');
    const ctx = canvas.getContext('2d');
    
    let frame = 0;
    const animate = () => {
      // 1. Clear background grid
      ctx.fillStyle = this.isDarkTheme ? '#0b0f19' : '#ffffff';
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      
      // Draw Cartesian coordinate grid lines
      ctx.strokeStyle = this.isDarkTheme ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
      ctx.lineWidth = 1;
      for (let x = 40; x < this.canvasWidth; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.canvasHeight);
        ctx.stroke();
      }
      for (let y = 40; y < this.canvasHeight; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.canvasWidth, y);
        ctx.stroke();
      }

      // Draw Center Axes
      ctx.strokeStyle = this.isDarkTheme ? 'rgba(6, 182, 212, 0.15)' : 'rgba(14, 165, 233, 0.15)';
      ctx.beginPath();
      ctx.moveTo(this.canvasWidth/2, 0);
      ctx.lineTo(this.canvasWidth/2, this.canvasHeight);
      ctx.moveTo(0, this.canvasHeight/2);
      ctx.lineTo(this.canvasWidth, this.canvasHeight/2);
      ctx.stroke();

      // 2. Draw all path lines created by pen
      this.drawnLines.forEach(line => {
        ctx.strokeStyle = line.color || '#a855f7';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      });

      // 3. Draw spaceship/turtle sprite
      const state = this.interpreter.spriteState;
      ctx.save();
      ctx.translate(state.x, state.y);
      // Math canvas coords decrease in Y, and mathematical standard angles are counter-clockwise.
      // So we need to rotate negative angle in standard canvas coordinates
      ctx.rotate(-state.angle * Math.PI / 180);

      // Draw glowing fire particles from thruster if executing moves
      if (this.interpreter.isRunning && !this.interpreter.isPaused && frame % 4 < 2) {
        ctx.fillStyle = 'rgba(236, 72, 153, 0.8)';
        ctx.beginPath();
        ctx.arc(-16, 0, 5 + Math.sin(frame)*2, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.6)';
        ctx.beginPath();
        ctx.arc(-22, 0, 3, 0, Math.PI*2);
        ctx.fill();
      }

      // Draw futuristic metallic spaceship polygon
      ctx.fillStyle = 'linear-gradient(135deg, #06b6d4, #a855f7)';
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#06b6d4';
      
      ctx.beginPath();
      ctx.moveTo(12, 0); // Head nose cone
      ctx.lineTo(-10, -10); // Left wing
      ctx.lineTo(-6, 0); // Tail hull
      ctx.lineTo(-10, 10); // Right wing
      ctx.closePath();
      
      const shipGrad = ctx.createLinearGradient(-10, 0, 12, 0);
      shipGrad.addColorStop(0, '#a855f7');
      shipGrad.addColorStop(1, '#06b6d4');
      ctx.fillStyle = shipGrad;
      ctx.fill();
      ctx.stroke();
      
      ctx.restore();

      // 4. Update coordinates stats display
      const stats = document.getElementById('coord-display');
      const mathX = Math.round(state.x - this.canvasWidth/2);
      const mathY = Math.round(this.canvasHeight/2 - state.y);
      stats.innerText = `X: ${mathX}, Y: ${mathY} | A: ${Math.round(state.angle)}°`;

      // 5. Update speech bubble positioning
      const bubble = document.getElementById('sprite-bubble');
      if (state.sayBubble !== null) {
        bubble.classList.remove('hidden');
        bubble.innerText = state.sayBubble;
        
        // Calculate canvas container screen coordinates
        const canvasRect = canvas.getBoundingClientRect();
        bubble.style.left = `${canvasRect.left + state.x - 20}px`;
        bubble.style.top = `${canvasRect.top + state.y - 45}px`;
      } else {
        bubble.classList.add('hidden');
      }

      frame++;
      requestAnimationFrame(animate);
    };

    animate();
  }

  handleSpriteCommand(cmd, state) {
    if (cmd === 'move' && state.penDown) {
      this.drawnLines.push({
        x1: state.oldX,
        y1: state.oldY,
        x2: state.newX,
        y2: state.newY,
        color: state.color
      });
    }
  }

  // -------------------------------------------------------------
  // 7. Console Terminals, Watches, & Line Highlights
  // -------------------------------------------------------------
  writeToConsole(msg) {
    const logs = document.getElementById('console-logs');
    const line = document.createElement('div');
    
    if (msg.startsWith('[Runtime Error]') || msg.startsWith('[Parser Error]')) {
      line.className = 'log-line error';
    } else if (msg.startsWith('[System]') || msg.startsWith('[Sync-Engine]')) {
      line.className = 'log-line system';
    } else if (msg.startsWith('[Library Call]') || msg.startsWith('[AI Agent]')) {
      line.className = 'log-line executing';
    } else {
      line.className = 'log-line output';
    }
    
    line.innerText = msg;
    logs.appendChild(line);
    logs.scrollTop = logs.scrollHeight;
  }

  updateVariablesWatch(bindings) {
    const watch = document.getElementById('variables-watch');
    watch.innerHTML = ''; // reset
    
    // Ignore internal functions range, print
    const userVars = Object.keys(bindings).filter(k => k !== 'range' && k !== 'print');
    
    if (userVars.length === 0) {
      watch.innerHTML = '<div class="var-row placeholder">No variables defined yet in running context.</div>';
      return;
    }

    userVars.forEach(vName => {
      const vVal = bindings[vName];
      const row = document.createElement('div');
      row.className = 'var-row';
      
      const displayVal = Array.isArray(vVal) ? `[${vVal.join(', ')}]` : vVal;
      
      row.innerHTML = `
        <span class="var-name">${vName}</span>
        <span class="var-val">${displayVal}</span>
      `;
      watch.appendChild(row);
    });
  }

  highlightEditorLine(lineNum) {
    this.clearEditorLineHighlights();
    
    const linesContainer = document.getElementById('line-numbers');
    const lineEl = linesContainer.children[lineNum - 1];
    if (lineEl) {
      lineEl.classList.add('line-highlight');
    }
  }

  clearEditorLineHighlights() {
    const linesContainer = document.getElementById('line-numbers');
    Array.from(linesContainer.children).forEach(el => {
      el.classList.remove('line-highlight');
    });
  }

  updateLineNumbers(code) {
    const count = code.split('\n').length;
    const container = document.getElementById('line-numbers');
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const lineDiv = document.createElement('div');
      lineDiv.innerText = i;
      container.appendChild(lineDiv);
    }
  }

  updateSyntaxStatus(isValid, errMsg = '') {
    const el = document.getElementById('syntax-status-text');
    if (isValid) {
      el.innerHTML = '<i class="fa-solid fa-circle-check"></i> Code Valid';
      el.className = 'syntax-status valid';
    } else {
      el.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Parser Error: ${errMsg.substring(0, 30)}...`;
      el.className = 'syntax-status invalid';
    }
  }

  // -------------------------------------------------------------
  // 8. Event Coordination & Buttons Triggers
  // -------------------------------------------------------------
  setupUIEventListeners() {
    // A. Sync Triggers
    document.getElementById('btn-sync-to-blocks').addEventListener('click', () => {
      this.syncCodeToBlocks();
    });

    const editor = document.getElementById('python-code');
    editor.addEventListener('input', () => {
      this.updateLineNumbers(editor.value);
    });

    document.getElementById('btn-format-code').addEventListener('click', () => {
      const code = editor.value;
      // Heuristics formatter that trims empty spaces and indents neatly
      const formatted = code.split('\n')
                            .map(line => line.trimRight())
                            .join('\n')
                            .trim();
      editor.value = formatted;
      this.updateLineNumbers(formatted);
      this.writeToConsole('[System] Re-formatted active editor lines.');
    });

    // Cursor positioning update
    editor.addEventListener('keyup', () => this.updateCursorStats());
    editor.addEventListener('mouseup', () => this.updateCursorStats());

    // B. Execution Triggers
    const btnRun = document.getElementById('btn-run');
    const btnPause = document.getElementById('btn-pause');
    const btnStep = document.getElementById('btn-step');
    const btnStop = document.getElementById('btn-stop');
    const speedSlider = document.getElementById('run-speed');

    btnRun.addEventListener('click', () => {
      if (this.interpreter.isPaused) {
        // Resume
        btnPause.disabled = false;
        btnRun.disabled = true;
        this.interpreter.runExecution(() => speedSlider.value, (err) => this.onExecutionFinish(err));
        return;
      }

      // Compile Python code to AST and run
      try {
        const code = editor.value;
        const lexer = new window.BlockPyParser.Tokenizer(code);
        const tokens = lexer.tokenize();
        const parser = new window.BlockPyParser.Parser(tokens);
        const ast = parser.parse();

        // Check if we should desugar
        let finalAST = ast;
        if (document.getElementById('toggle-desugar').checked) {
          const desugarer = new window.BlockPyDesugarer.ASTDesugarer();
          finalAST = desugarer.desugar(ast);
        }

        // Initialize Interpreter
        this.interpreter.initProgram(finalAST);
        this.drawnLines = []; // reset canvas drawings
        
        btnRun.disabled = true;
        btnPause.disabled = false;
        btnStop.disabled = false;
        
        this.writeToConsole('[Interpreter] Initiating execution generator stack...');
        
        // Start running loops
        this.interpreter.runExecution(() => speedSlider.value, (err) => this.onExecutionFinish(err));
      } catch (err) {
        this.writeToConsole(`[Interpreter Compile Error] ${err.message}`);
      }
    });

    btnPause.addEventListener('click', () => {
      this.interpreter.pauseExecution();
      btnPause.disabled = true;
      btnRun.disabled = false;
      this.writeToConsole('[Interpreter] Execution paused.');
    });

    btnStep.addEventListener('click', () => {
      if (!this.interpreter.isRunning) {
        // Compile first
        try {
          const code = editor.value;
          const lexer = new window.BlockPyParser.Tokenizer(code);
          const tokens = lexer.tokenize();
          const parser = new window.BlockPyParser.Parser(tokens);
          const ast = parser.parse();
          
          let finalAST = ast;
          if (document.getElementById('toggle-desugar').checked) {
            const desugarer = new window.BlockPyDesugarer.ASTDesugarer();
            finalAST = desugarer.desugar(ast);
          }
          this.interpreter.initProgram(finalAST);
          this.drawnLines = [];
          btnStop.disabled = false;
          this.writeToConsole('[Interpreter] Initialized. Stepping first statement node...');
        } catch (err) {
          this.writeToConsole(`[Interpreter Step Error] ${err.message}`);
          return;
        }
      }

      const res = this.interpreter.stepExecution();
      if (res.done) {
        this.onExecutionFinish();
      }
    });

    btnStop.addEventListener('click', () => {
      this.interpreter.reset();
      this.drawnLines = [];
      this.clearEditorLineHighlights();
      
      btnRun.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
      
      this.writeToConsole('[Interpreter] Execution halted. Environment variables and coordinates reset.');
    });

    document.getElementById('btn-clear-canvas').addEventListener('click', () => {
      this.drawnLines = [];
    });

    document.getElementById('btn-clear-console').addEventListener('click', () => {
      document.getElementById('console-logs').innerHTML = '';
    });

    // C. AST normalizer templates and tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const targetTab = btn.getAttribute('data-tab');
        document.getElementById('tab-desugar-preview').classList.add('hidden');
        document.getElementById('tab-sugar-examples').classList.add('hidden');
        document.getElementById(targetTab).classList.remove('hidden');
      });
    });

    const templateCards = document.querySelectorAll('.template-card');
    templateCards.forEach(card => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-template');
        this.loadDemoScript(type);
      });
    });

    // D. Theme toggles
    document.getElementById('theme-toggle').addEventListener('click', () => {
      this.isDarkTheme = !this.isDarkTheme;
      document.body.classList.toggle('light-theme');
      
      const icon = document.getElementById('theme-toggle').querySelector('i');
      icon.className = this.isDarkTheme ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
      
      // Refresh Blockly injection theme
      this.workspace.dispose();
      this.mountBlockly();
      
      // Force refresh of layout
      this.syncCodeToBlocks();
    });

    // E. AI Library abstraction clicker
    document.getElementById('btn-abstract-library').addEventListener('click', () => {
      const selector = document.getElementById('lib-selector');
      const val = selector.value;
      const customCode = document.getElementById('custom-lib-prompt').value;
      
      this.abstractionEngine.runAbstraction(val, customCode);
    });

    document.getElementById('lib-selector').addEventListener('change', (e) => {
      const customWrapper = document.getElementById('custom-prompt-wrapper');
      if (e.target.value === 'custom') {
        customWrapper.classList.remove('hidden');
      } else {
        customWrapper.classList.add('hidden');
      }
    });
  }

  onExecutionFinish(error) {
    document.getElementById('btn-run').disabled = false;
    document.getElementById('btn-pause').disabled = true;
    document.getElementById('btn-stop').disabled = true;
    this.clearEditorLineHighlights();
    
    if (error) {
      this.writeToConsole(`[Interpreter Halted] Finished with runtime exception.`);
    } else {
      this.writeToConsole('[Interpreter Halted] Program execution completed successfully.');
    }
  }

  updateCursorStats() {
    const editor = document.getElementById('python-code');
    const text = editor.value;
    const selStart = editor.selectionStart;
    
    const lines = text.substring(0, selStart).split('\n');
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length + 1;
    
    document.getElementById('caret-position').innerText = `Ln ${lineNum}, Col ${colNum}`;
  }

  // -------------------------------------------------------------
  // 9. Built-in Demos Scripts & Templates
  // -------------------------------------------------------------
  loadDemoScript(type) {
    const editor = document.getElementById('python-code');
    
    let demoCode = '';
    switch (type) {
      case 'opencv':
        demoCode = `# OpenCV Webcam Stream & Visual Feed Demo
cap = cv2.VideoCapture(0)
while True:
    ret = 1
    frame = cv2.imread("webcam_input.jpg")
    cv2.imshow("Live Video Stream", frame)
    key = cv2.waitKey(1)
    if key == 27:
        break
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

    editor.value = demoCode;
    this.updateLineNumbers(demoCode);
    
    // Automatically compile code to blocks!
    this.syncCodeToBlocks();
  }
}

// Instantiate on startup
window.addEventListener('load', () => {
  window.appOrchestrator = new AppOrchestrator();
});
