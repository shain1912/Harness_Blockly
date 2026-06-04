/* libraryAbstraction.js - AI Library Abstraction Panel & Dynamic Blockly Toolbox customizer */

// Predefined AI Library Abstraction specifications (Offline Mock Presets)
const AI_PRESETS = {
  cv2: {
    thoughts: [
      "Analyzing import statement: 'import cv2'",
      "Target: 'OpenCV-Python' computer vision suite.",
      "Abstraction Strategy: Scanning imaging and stream layers. Collapsing massive pixel and filter matrices. AI maps fixed un-editable visual blocks for reading images, video streams, wait delays, and window destructions.",
      "Generating dynamic block specifications...",
      "Successfully registered un-editable blocks: cv2.imread, cv2.imshow, cv2.VideoCapture, cv2.waitKey, and cv2.destroyAllWindows."
    ],
    blocks: [
      { func: 'imread', args: ['filename'], hasOutput: true, colour: '#06b6d4', title: 'cv2.imread' },
      { func: 'imshow', args: ['winname', 'mat'], hasOutput: false, colour: '#1e1b4b', title: 'cv2.imshow' },
      { func: 'VideoCapture', args: ['device_index'], hasOutput: true, colour: '#0ea5e9', title: 'cv2.VideoCapture' },
      { func: 'waitKey', args: ['delay'], hasOutput: true, colour: '#8b5cf6', title: 'cv2.waitKey' },
      { func: 'destroyAllWindows', args: [], hasOutput: false, colour: '#ec4899', title: 'cv2.destroyAllWindows' }
    ]
  },
  requests: {
    thoughts: [
      "Analyzing import statement: 'import requests'",
      "Target: 'requests' HTTP Networking library.",
      "Abstraction Strategy: Collapse heavy socket and session protocols. Instead of mapping hundreds of request/response headers, abstract requests to two general high-utility blocks: GET and POST.",
      "Generating dynamic block specifications...",
      "Successfully registered blocks: requests.get and requests.post."
    ],
    blocks: [
      { func: 'get', args: ['url'], hasOutput: true, colour: '#14b8a6', title: 'requests.get' },
      { func: 'post', args: ['url', 'data'], hasOutput: true, colour: '#0d9488', title: 'requests.post' }
    ]
  },
  matplotlib: {
    thoughts: [
      "Analyzing import statement: 'import matplotlib.pyplot as plt'",
      "Target: 'matplotlib.pyplot' data visualization suite.",
      "Abstraction Strategy: Plotting has immense state configurations (axes, grid, markers). AI collapses visual renders into 3 simple declarative blocks: PLOT (for coordinate lines), TITLE (for header text), and SHOW (statement trigger).",
      "Generating dynamic block specifications...",
      "Successfully registered blocks: plt.plot, plt.title, and plt.show."
    ],
    blocks: [
      { func: 'plot', args: ['x_data', 'y_data'], hasOutput: false, colour: '#b55bf7', title: 'plt.plot' },
      { func: 'title', args: ['label'], hasOutput: false, colour: '#a855f7', title: 'plt.title' },
      { func: 'show', args: [], hasOutput: false, colour: '#8b5cf6', title: 'plt.show' }
    ]
  },
  pandas: {
    thoughts: [
      "Analyzing import statement: 'import pandas as pd'",
      "Target: 'pandas' complex data processing framework.",
      "Abstraction Strategy: Collapse massive matrix and DataFrame computations down to 2 primary high-level abstract blocks: Read CSV file and DataFrame Describe analysis.",
      "Generating dynamic block specifications...",
      "Successfully registered blocks: pd.read_csv and df.describe."
    ],
    blocks: [
      { func: 'read_csv', args: ['file_path'], hasOutput: true, colour: '#eab308', title: 'pd.read_csv' },
      { func: 'describe', args: ['df'], hasOutput: true, colour: '#ca8a04', title: 'df.describe' }
    ]
  },
  math: {
    thoughts: [
      "Analyzing import statement: 'import math'",
      "Target: C-compiled standard math operations library.",
      "Abstraction Strategy: Abstract two frequent trigonometric and algebraic functions: Square Root and Sine, bypassing bitwise complexities.",
      "Generating dynamic block specifications...",
      "Successfully registered blocks: math.sqrt and math.sin."
    ],
    blocks: [
      { func: 'sqrt', args: ['x'], hasOutput: true, colour: '#3b82f6', title: 'math.sqrt' },
      { func: 'sin', args: ['angle'], hasOutput: true, colour: '#2563eb', title: 'math.sin' }
    ]
  }
};

class LibraryAbstractionEngine {
  constructor(workspace, onLog = console.log) {
    this.workspace = workspace;
    this.onLog = onLog;
    this.installedBlocksCount = 0;
    this.activeBlocks = []; // stores details of currently active dynamic blocks
  }

  // Register a dynamic Blockly block at runtime.
  // Statement and expression uses of the same lib function need DIFFERENT block types:
  // an output (expression) block has no prev/next connection, a statement block does.
  // The `_stmt` suffix keeps them distinct while the generator still emits lib.func(...).
  registerBlock(libName, funcName, args, hasOutput, colour, titleLabel) {
    const blockType = `lib_${libName}_${funcName}${hasOutput ? '' : '_stmt'}`;

    // Safety Guard: Avoid re-registering existing blocks to prevent Blockly collisions
    if (Blockly.Blocks[blockType]) {
      return blockType;
    }

    // 1. Register block visual structure (100% un-editable labels)
    Blockly.Blocks[blockType] = {
      init: function() {
        // Enforce Static Text Label (appendField with string is read-only in Blockly!)
        this.appendDummyInput()
            .appendField(titleLabel || `${libName}.${funcName}`);
        
        // Add parameter value inputs (No text-inputs here! Only connections allowed)
        args.forEach((argName, idx) => {
          this.appendValueInput(`ARG${idx}`)
              .setCheck(null)
              .appendField(argName);
        });
        
        if (hasOutput) {
          this.setOutput(true, null);
        } else {
          this.setPreviousStatement(true, null);
          this.setNextStatement(true, null);
        }
        
        this.setColour(colour || '#009688');
        this.setTooltip(`Abstract static block for ${libName}.${funcName}`);
      }
    };

    // 2. Register Python code generator for the block
    const generatorFn = function(block) {
      const generatedArgs = [];
      args.forEach((_, idx) => {
        const code = Blockly.Python.valueToCode(block, `ARG${idx}`, Blockly.Python.ORDER_NONE) || 'None';
        generatedArgs.push(code);
      });
      
      const statement = `${libName}.${funcName}(${generatedArgs.join(', ')})`;
      if (hasOutput) {
        return [statement, Blockly.Python.ORDER_FUNCTION_CALL];
      } else {
        return statement + '\n';
      }
    };

    Blockly.Python[blockType] = generatorFn;
    if (Blockly.Python.forBlock) {
      Blockly.Python.forBlock[blockType] = generatorFn;
    }

    return blockType;
  }

  // Abstract library dynamically based on select or custom imports
  async runAbstraction(libKey, customCode = '') {
    const chatSim = document.getElementById('ai-chat-sim');
    const blocksList = document.getElementById('dynamic-blocks-list');
    const badgeCount = document.getElementById('dynamic-blocks-count');
    
    if (chatSim) chatSim.innerHTML = ''; // reset chat
    
    let libraryData = null;
    let libName = libKey;

    if (libKey === 'custom') {
      // Analyze custom code via heuristic parser
      libName = this.extractLibraryName(customCode) || 'custom_lib';
      const methods = this.extractMethodsHeuristics(customCode);
      
      libraryData = {
        thoughts: [
          `Analyzing custom import statement: "${customCode.trim()}"`,
          `Detected target library name: "${libName}"`,
          `AI abstract reasoning: Found ${methods.length} key methods. Abstracting into simple, modular input blocks...`,
          "Successfully generated visual specs."
        ],
        blocks: methods.map((m, idx) => ({
          func: m.name,
          args: m.args,
          hasOutput: m.hasOutput,
          colour: ['#14b8a6', '#0d9488', '#b55bf7', '#a855f7', '#eab308'][idx % 5],
          title: `${libName}.${m.name}`
        }))
      };
    } else {
      libraryData = AI_PRESETS[libKey];
    }

    if (!libraryData) return;

    // Simulate AI thinking step-by-step on screen!
    for (const thought of libraryData.thoughts) {
      await this.sleep(600);
      if (chatSim) {
        const bubble = document.createElement('div');
        bubble.className = 'ai-chat-bubble ai';
        bubble.innerHTML = `<strong>AI Agent:</strong> ${thought}`;
        chatSim.appendChild(bubble);
        chatSim.scrollTop = chatSim.scrollHeight;
      }
    }

    // Register blocks
    const registeredTypes = [];
    libraryData.blocks.forEach(b => {
      const typeName = this.registerBlock(libName, b.func, b.args, b.hasOutput, b.colour, b.title);
      // Avoid adding duplicate visual representations to the palette list
      if (!this.activeBlocks.some(active => active.type === typeName)) {
        registeredTypes.push({ type: typeName, title: b.title, hasOutput: b.hasOutput });
      }
    });

    this.activeBlocks.push(...registeredTypes);
    this.installedBlocksCount += registeredTypes.length;
    if (badgeCount) badgeCount.innerText = `${this.installedBlocksCount} Blocks Installed`;
    this.onLog(`[AI Agent] Registered ${registeredTypes.length} dynamic static blocks for library "${libName}".`);

    // Render registered blocks in list card
    if (blocksList) {
      if (blocksList.querySelector('.empty-list-placeholder')) {
        blocksList.innerHTML = '';
      }

      registeredTypes.forEach(b => {
        const pill = document.createElement('div');
        pill.className = 'dyn-block-pill';
        pill.innerHTML = `
          <span class="dyn-block-name">${b.title}</span>
          <span class="dyn-block-type">${b.hasOutput ? 'Output Block' : 'Statement Block'}</span>
        `;
        blocksList.appendChild(pill);
      });
    }

    // Update Blockly Toolbox!
    this.updateBlocklyToolbox();
  }

  // Inject dynamic blocks into Blockly Toolbox category XML
  updateBlocklyToolbox() {
    const toolboxXml = document.getElementById('toolbox');
    if (!toolboxXml) return;

    const category = toolboxXml.querySelector('#abstract-lib-category');
    if (!category) return;

    // Make category visible
    category.style.display = 'block';
    category.removeAttribute('style'); // ensure display none is fully deleted

    // Append child block nodes
    category.innerHTML = ''; // reset
    
    // Sort blocks by name for neat visual arrangement
    this.activeBlocks.forEach(b => {
      const blockNode = document.createElement('block');
      blockNode.setAttribute('type', b.type);
      category.appendChild(blockNode);
    });

    // Update workspace toolbox
    if (this.workspace) {
      this.workspace.updateToolbox(toolboxXml);
    }
  }

  // Heuristic library name extractor
  extractLibraryName(code) {
    // import tensorflow as tf
    let match = code.match(/import\s+([a-zA-Z0-9_.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?/);
    if (match) {
      return match[2] || match[1];
    }
    // from os import path
    match = code.match(/from\s+([a-zA-Z0-9_.]+)\s+import/);
    if (match) return match[1];
    return null;
  }

  // Heuristics parser that converts code into a list of methods
  extractMethodsHeuristics(code) {
    const methods = [];
    const lines = code.split('\n');
    
    for (const line of lines) {
      // Find method calls like: lib.predict(data, labels)
      const match = line.match(/\.([a-zA-Z0-9_]+)\(([^)]*)\)/);
      if (match) {
        const name = match[1];
        const argsStr = match[2];
        const args = argsStr.split(',')
                            .map(a => a.trim())
                            .filter(a => a.length > 0 && !a.startsWith('"') && !a.startsWith("'") && isNaN(a));
        
        // check if assigned to a variable (implies output)
        const hasOutput = line.includes('=');
        
        // Avoid duplicate method names
        if (!methods.some(m => m.name === name)) {
          methods.push({ name, args, hasOutput });
        }
      }
    }

    if (methods.length === 0) {
      // Default fallback methods
      methods.push({ name: 'call_method', args: ['arg1', 'arg2'], hasOutput: true });
      methods.push({ name: 'execute_command', args: ['param'], hasOutput: false });
    }

    return methods;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Expose globally and for Node environment
const BlockPyAbstraction = {
  LibraryAbstractionEngine,
  AI_PRESETS
};

if (typeof window !== 'undefined') {
  window.BlockPyAbstraction = BlockPyAbstraction;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BlockPyAbstraction;
}
