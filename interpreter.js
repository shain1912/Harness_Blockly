/* interpreter.js - AST-Walking JS Interpreter & Canvas Turtle Runner */

const BlockPyParser = typeof window !== 'undefined' ? window.BlockPyParser : require('./parser');

function formatValue(val, isInsideList = false) {
  if (Array.isArray(val)) {
    return '[' + val.map(v => formatValue(v, true)).join(', ') + ']';
  }
  if (val === null) return 'None';
  if (val === true) return 'True';
  if (val === false) return 'False';
  if (typeof val === 'string') {
    return isInsideList ? `'${val}'` : val;
  }
  return String(val);
}

class InterpreterEnv {
  constructor(parent = null) {
    this.bindings = {};
    this.parent = parent;
  }

  get(name) {
    if (name in this.bindings) {
      return this.bindings[name];
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new ReferenceError(`Variable "${name}" is not defined`);
  }

  set(name, value) {
    this.bindings[name] = value;
  }

  has(name) {
    if (name in this.bindings) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
}

class ASTInterpreter {
  constructor(options = {}) {
    this.onLog = options.onLog || console.log;
    this.onVarUpdate = options.onVarUpdate || (() => {});
    this.onSpriteCommand = options.onSpriteCommand || (() => {});
    this.onHighlightLine = options.onHighlightLine || (() => {});
    this.onCv2Action = options.onCv2Action || null;

    this.env = new InterpreterEnv();
    this.spriteState = {
      x: 240,
      y: 140,
      angle: 0,
      penDown: false,
      color: '#a855f7',
      sayBubble: null
    };

    this.executionIterator = null;
    this.isRunning = false;
    this.isPaused = false;
    this._cv2Windows = {};

    this.reset();
  }

  _buildCv2Namespace() {
    const self = this;
    return {
      VideoCapture: (deviceId) => {
        const title = `VideoCapture(${deviceId})`;
        self.onLog(`[cv2] Opening camera ${deviceId}...`);
        if (self.onCv2Action) self.onCv2Action('open', { title, deviceId });
        const capObj = {
          _type: 'VideoCapture',
          _deviceId: deviceId,
          read: () => {
            return [1, { _type: 'Frame', _deviceId: deviceId }];
          },
          release: () => {
            if (self.onCv2Action) self.onCv2Action('release', { deviceId });
            self.onLog(`[cv2] Camera ${deviceId} released.`);
          }
        };
        return capObj;
      },
      imshow: (title, frame) => {
        if (self.onCv2Action) self.onCv2Action('imshow', { title, frame });
        else self.onLog(`[cv2] imshow("${title}")`);
      },
      imread: (path) => {
        self.onLog(`[cv2] imread("${path}")`);
        if (self.onCv2Action) self.onCv2Action('imread', { path });
        return { _type: 'Image', _path: path };
      },
      imwrite: (path, img) => {
        self.onLog(`[cv2] imwrite("${path}")`);
        return true;
      },
      waitKey: (delay) => 0,
      destroyAllWindows: () => {
        if (self.onCv2Action) self.onCv2Action('destroyAll', {});
        self.onLog('[cv2] All windows closed.');
      },
      destroyWindow: (title) => {
        if (self.onCv2Action) self.onCv2Action('destroy', { title });
      },
      resize: (img, dsize) => ({ _type: 'Image', _resized: true }),
      cvtColor: (img, code) => ({ _type: 'Image', _converted: true }),
    };
  }

  reset() {
    this.env = new InterpreterEnv();
    // Default standard built-in bindings
    this.env.set('range', (start, stop, step) => this.evalRange(start, stop, step));
    this.env.set('print', (...args) => this.onLog(args.map(arg => formatValue(arg)).join(' ')));
    // cv2 namespace
    this.env.set('cv2', this._buildCv2Namespace());
    
    this.spriteState = {
      x: 240,
      y: 140,
      angle: 0, // Right is 0 degrees (Standard mathematical direction)
      penDown: false,
      color: '#a855f7',
      sayBubble: null
    };
    
    this.executionIterator = null;
    this.isRunning = false;
    this.isPaused = false;
    this.onVarUpdate(this.env.bindings);
  }

  // Synchronous evaluation of leaf nodes and expressions
  evalExpression(node) {
    if (!node) return null;

    switch (node.type) {
      case 'Num':
        return node.value;
        
      case 'Str':
        return node.value;
        
      case 'Bool':
        return node.value;
        
      case 'Name':
        if (node.id === 'True') return true;
        if (node.id === 'False') return false;
        if (node.id === 'None') return null;
        return this.env.get(node.id);
        
      case 'List':
        return node.elts.map(elt => this.evalExpression(elt));
        
      case 'BinOp': {
        if (node.op === 'INDEX') {
          const listVal = this.evalExpression(node.left);
          const indexVal = this.evalExpression(node.right);
          if (!Array.isArray(listVal)) {
            throw new TypeError(`Cannot index non-list value: ${listVal}`);
          }
          // Blockly uses 1-based indexing for standard blocks, but Python uses 0-based.
          // Let's support standard 0-based indexing for code parser consistency.
          const idx = Math.floor(Number(indexVal));
          if (idx < 0 || idx >= listVal.length) {
            throw new RangeError(`List index out of range: ${idx}`);
          }
          return listVal[idx];
        }

        const leftVal = node.left ? this.evalExpression(node.left) : null;
        const rightVal = this.evalExpression(node.right);

        switch (node.op) {
          // Arithmetic operators
          case '+': return Number(leftVal) + Number(rightVal);
          case '-': return Number(leftVal) - Number(rightVal);
          case '*': return Number(leftVal) * Number(rightVal);
          case '/': return Number(leftVal) / Number(rightVal);
          
          // Comparison operators
          case '==': return leftVal === rightVal;
          case '!=': return leftVal !== rightVal;
          case '<': return Number(leftVal) < Number(rightVal);
          case '<=': return Number(leftVal) <= Number(rightVal);
          case '>': return Number(leftVal) > Number(rightVal);
          case '>=': return Number(leftVal) >= Number(rightVal);
          
          // Logical operators
          case 'and': return leftVal && rightVal;
          case 'or': return leftVal || rightVal;
          case 'not': return !rightVal;
        }
        break;
      }
      
      case 'Range':
        // Evaluate dynamic bounds of the range
        const startVal = node.start ? this.evalExpression(node.start) : 0;
        const stopVal = this.evalExpression(node.stop);
        const stepVal = node.step ? this.evalExpression(node.step) : 1;
        return this.evalRange(startVal, stopVal, stepVal);

      case 'Lambda': {
        const lam = node;
        const self = this;
        const fn = function(...args) {
          const oldEnv = self.env;
          self.env = new InterpreterEnv(oldEnv);
          for (let i = 0; i < lam.params.length; i++) {
            self.env.set(lam.params[i], args[i]);
          }
          try {
            return self.evalExpression(lam.body);
          } finally {
            self.env = oldEnv;
          }
        };
        return fn;
      }

      case 'Call': {
        if (node.func.type === 'Name') {
          try {
            const fn = this.env.get(node.func.id);
            if (typeof fn === 'function') {
              const args = node.args.map(arg => this.evalExpression(arg));
              return fn(...args);
            }
          } catch (e) { /* fall through */ }
        }
        this.executeCallNode(node);
        return null;
      }

      default:
        throw new Error(`Evaluation not supported for expression type: ${node.type}`);
    }
  }

  evalRange(start, stop, step = 1) {
    if (stop === undefined) {
      stop = start;
      start = 0;
    }
    const arr = [];
    if (step > 0) {
      for (let i = start; i < stop; i += step) arr.push(i);
    } else if (step < 0) {
      for (let i = start; i > stop; i += step) arr.push(i);
    }
    return arr;
  }

  // -------------------------------------------------------------
  // Generator AST Runner: yields on statements for slow execution
  // -------------------------------------------------------------
  initProgram(programAST) {
    this.reset();
    this.executionIterator = this.evalStatementList(programAST.body);
    this.isRunning = true;
  }

  *evalStatementList(statements) {
    for (const stmt of statements) {
      yield* this.evalStatement(stmt);
    }
  }

  *evalStatement(node) {
    if (!node) return;

    // Yield back to runner to highlight active line and block before running the statement!
    this.onHighlightLine(node.line);
    yield node; 

    switch (node.type) {
      case 'Assign': {
        const val = this.evalExpression(node.value);
        if (node.target.type === 'Name') {
          this.env.set(node.target.id, val);
        } else if (node.target.type === 'BinOp' && node.target.op === 'INDEX') {
          // List item modification: arr[i] = val
          const listVal = this.evalExpression(node.target.left);
          const indexVal = this.evalExpression(node.target.right);
          if (!Array.isArray(listVal)) {
            throw new TypeError('Cannot set index on non-list value');
          }
          const idx = Math.floor(Number(indexVal));
          listVal[idx] = val;
        }
        this.onVarUpdate(this.env.bindings);
        break;
      }

      case 'AugAssign': {
        const varName = node.target.id;
        const oldVal = this.env.get(varName);
        const diffVal = this.evalExpression(node.value);
        let newVal = oldVal;
        
        if (node.op === '+=') newVal = Number(oldVal) + Number(diffVal);
        else if (node.op === '-=') newVal = Number(oldVal) - Number(diffVal);
        else if (node.op === '*=') newVal = Number(oldVal) * Number(diffVal);
        else if (node.op === '/=') newVal = Number(oldVal) / Number(diffVal);
        
        this.env.set(varName, newVal);
        this.onVarUpdate(this.env.bindings);
        break;
      }

      case 'For': {
        const listVal = this.evalExpression(node.iter);
        if (!Array.isArray(listVal)) {
          throw new TypeError(`Cannot loop over non-iterable value: ${listVal}`);
        }
        
        const loopVar = node.target.id;
        for (const item of listVal) {
          this.env.set(loopVar, item);
          this.onVarUpdate(this.env.bindings);
          
          // Execute loop body
          yield* this.evalStatementList(node.body);
        }
        break;
      }

      case 'While': {
        while (this.evalExpression(node.test)) {
          yield* this.evalStatementList(node.body);
        }
        break;
      }

      case 'If': {
        const isTruthy = this.evalExpression(node.test);
        if (isTruthy) {
          yield* this.evalStatementList(node.body);
        } else if (node.orelse && node.orelse.length > 0) {
          yield* this.evalStatementList(node.orelse);
        }
        break;
      }

      case 'Call': {
        // Method calls like sprite.move(10) or requests.get()
        this.executeCallNode(node);
        break;
      }

      case 'FunctionDef': {
        const fnDef = node;
        const self = this;
        const fn = function(...args) {
          const oldEnv = self.env;
          self.env = new InterpreterEnv(oldEnv);
          for (let i = 0; i < fnDef.params.length; i++) {
            self.env.set(fnDef.params[i], args[i]);
          }
          let returnVal = undefined;
          try {
            const it = self.evalStatementList(fnDef.body);
            let res = it.next();
            while (!res.done) res = it.next();
          } catch (e) {
            if (e && e.__isReturn) {
              returnVal = e.value;
            } else {
              throw e;
            }
          } finally {
            self.env = oldEnv;
          }
          return returnVal;
        };
        this.env.set(node.name, fn);
        this.onVarUpdate(this.env.bindings);
        break;
      }
      case 'ClassDef': {
        const clsName = node.name;
        const self = this;
        const methods = {};
        const classAttrs = {};
        for (const stmt of node.body) {
          if (stmt.type === 'FunctionDef') {
            methods[stmt.name] = stmt;
          } else if (stmt.type === 'Assign' && stmt.target.type === 'Name') {
            classAttrs[stmt.target.id] = this.evalExpression(stmt.value);
          }
        }
        const ctor = function(...args) {
          const instance = { __class__: clsName, ...classAttrs };
          for (const mName in methods) {
            const mDef = methods[mName];
            instance[mName] = function(...callArgs) {
              const oldEnv = self.env;
              self.env = new InterpreterEnv(oldEnv);
              if (mDef.params.length > 0) self.env.set(mDef.params[0], instance);
              for (let i = 1; i < mDef.params.length; i++) {
                self.env.set(mDef.params[i], callArgs[i - 1]);
              }
              let returnVal = undefined;
              try {
                const it = self.evalStatementList(mDef.body);
                let res = it.next();
                while (!res.done) res = it.next();
              } catch (e) {
                if (e && e.__isReturn) returnVal = e.value;
                else throw e;
              } finally {
                self.env = oldEnv;
              }
              return returnVal;
            };
          }
          if (typeof instance.__init__ === 'function') {
            instance.__init__(...args);
          }
          return instance;
        };
        ctor.__class__ = clsName;
        this.env.set(clsName, ctor);
        this.onVarUpdate(this.env.bindings);
        break;
      }
      case 'Return': {
        const val = node.value !== null && node.value !== undefined ? this.evalExpression(node.value) : undefined;
        const ret = new Error('__return__');
        ret.__isReturn = true;
        ret.value = val;
        throw ret;
      }

      case 'Pass':
        // pass is a no-op
        break;
        
      default:
        // Expressions run as statements are evaluated and discarded
        this.evalExpression(node);
    }
  }

  executeCallNode(node) {
    // 0. Generic instance method call: instance.method(args)
    if (node.func.type === 'Attribute') {
      try {
        const target = this.evalExpression(node.func.value);
        if (target && typeof target[node.func.attr] === 'function' && target.__class__) {
          const args = node.args.map(arg => this.evalExpression(arg));
          const result = target[node.func.attr](...args);
          this.onVarUpdate(this.env.bindings);
          return result;
        }
      } catch (e) { /* fall through to existing logic */ }
    }

    // 1. Check if it's a sprite method call: sprite.xxx(...)
    if (node.func.type === 'Attribute' && node.func.value.type === 'Name' && node.func.value.id === 'sprite') {
      const method = node.func.attr;
      const args = node.args.map(arg => this.evalExpression(arg));
      
      switch (method) {
        case 'move': {
          const steps = Number(args[0]) || 50;
          const rad = (this.spriteState.angle * Math.PI) / 180;
          
          // Calculate new coordinates
          const oldX = this.spriteState.x;
          const oldY = this.spriteState.y;
          const newX = oldX + steps * Math.cos(rad);
          // Canvas coordinates Y decreases upwards, so we subtract
          const newY = oldY - steps * Math.sin(rad);
          
          this.spriteState.x = newX;
          this.spriteState.y = newY;
          
          this.onSpriteCommand('move', { oldX, oldY, newX, newY, ...this.spriteState });
          break;
        }

        case 'turn_right':
        case 'turn': {
          const angle = Number(args[0]) || 90;
          // Clockwise rotation decreases mathematically standard angles
          this.spriteState.angle = (this.spriteState.angle - angle) % 360;
          this.onSpriteCommand('turn', this.spriteState);
          break;
        }

        case 'turn_left': {
          const angle = Number(args[0]) || 90;
          // Counter-clockwise increases mathematically standard angles
          this.spriteState.angle = (this.spriteState.angle + angle) % 360;
          this.onSpriteCommand('turn', this.spriteState);
          break;
        }

        case 'pen_down':
          this.spriteState.penDown = true;
          this.onSpriteCommand('pen', this.spriteState);
          break;

        case 'pen_up':
          this.spriteState.penDown = false;
          this.onSpriteCommand('pen', this.spriteState);
          break;

        case 'color':
          this.spriteState.color = args[0] || '#a855f7';
          this.onSpriteCommand('color', this.spriteState);
          break;

        case 'say':
          this.spriteState.sayBubble = args[0] !== undefined ? String(args[0]) : '';
          this.onSpriteCommand('say', this.spriteState);
          break;
          
        default:
          this.onLog(`[Warning] Unknown sprite method: sprite.${method}`);
      }
      return;
    }

    // 2. Check for standard library print calls
    if (node.func.type === 'Name' && node.func.id === 'print') {
      const args = node.args.map(arg => this.evalExpression(arg));
      this.onLog(args.map(arg => formatValue(arg)).join(' '));
      return;
    }

    // 3. Check for list append call: list.append(val)
    if (node.func.type === 'Attribute' && node.func.attr === 'append') {
      const listVal = this.evalExpression(node.func.value);
      const appendVal = this.evalExpression(node.args[0]);
      if (Array.isArray(listVal)) {
        listVal.push(appendVal);
        this.onVarUpdate(this.env.bindings);
      } else {
        throw new TypeError('Cannot append to non-list object');
      }
      return;
    }

    // 4. Abstract dynamic library method call (AI simulated or customized)
    if (node.func.type === 'Attribute' && node.func.value.type === 'Name') {
      const libName = node.func.value.id;
      const attrName = node.func.attr;
      const args = node.args.map(arg => this.evalExpression(arg));
      
      // Simulate library method call and output to console beautifully!
      const argsStr = args.map(a => typeof a === 'string' ? `"${a}"` : a).join(', ');
      this.onLog(`[Library Call] ${libName}.${attrName}(${argsStr}) executed.`);
      return;
    }

    // 5. User-defined function or class constructor call
    if (node.func.type === 'Name') {
      try {
        const fn = this.env.get(node.func.id);
        if (typeof fn === 'function') {
          const args = node.args.map(arg => this.evalExpression(arg));
          const result = fn(...args);
          this.onVarUpdate(this.env.bindings);
          // If it's a class constructor (returns instance), don't return void
          return;
        }
      } catch (e) {
        // Variable lookup failure falls through
      }
    }

    // Default error
    throw new TypeError(`Function "${BlockPyParser.astToPython(node.func)}" is not callable`);
  }

  // -------------------------------------------------------------
  // External Execution Control loops (Play, Pause, Step)
  // -------------------------------------------------------------
  stepExecution() {
    if (!this.executionIterator) return { done: true };
    
    try {
      const result = this.executionIterator.next();
      if (result.done) {
        this.isRunning = false;
        this.isPaused = false;
      }
      return result;
    } catch (err) {
      this.onLog(`[Runtime Error] ${err.message}`);
      this.isRunning = false;
      this.isPaused = false;
      return { done: true, error: err };
    }
  }

  runExecution(speedSliderVal, onComplete = () => {}) {
    this.isPaused = false;
    
    // Map speed slider range (1 to 100) to delay milliseconds (1000ms down to 5ms)
    const calculateDelay = (val) => {
      if (val >= 95) return 5;
      return Math.max(10, Math.floor(1000 * Math.pow(1 - val/100, 1.8)));
    };

    const nextStep = () => {
      if (this.isPaused || !this.isRunning) return;

      const result = this.stepExecution();
      if (result.done) {
        onComplete(result.error);
      } else {
        const delay = calculateDelay(Number(speedSliderVal()));
        setTimeout(nextStep, delay);
      }
    };

    nextStep();
  }

  pauseExecution() {
    this.isPaused = true;
  }
}

// Expose globally and for Node environment
const BlockPyInterpreter = {
  ASTInterpreter
};

if (typeof window !== 'undefined') {
  window.BlockPyInterpreter = BlockPyInterpreter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BlockPyInterpreter;
}
