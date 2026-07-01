/* irBlocks.js — Blockly.Blocks visual definitions for IR block types (side-effect load).
 * Generators are intentionally NOT defined here: block -> Python goes block -> IR ->
 * ast.unparse (single IR), not via Blockly.Python. These defs only make blocks render.
 */

const Blockly = (typeof window !== 'undefined' && window.Blockly);

// MakeCode-style +/- buttons for ir_call's argument list (white-circle minus/plus glyphs + a "+kw"
// pill). Inline data-URIs so no asset pipeline is needed. Module scope so every ir block def sees them.
const ARITY_MINUS_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCI+PGNpcmNsZSBjeD0iOSIgY3k9IjkiIHI9IjgiIGZpbGw9IiNmZmYiIHN0cm9rZT0iI2NjYyIvPjxyZWN0IHg9IjQuNSIgeT0iOCIgd2lkdGg9IjkiIGhlaWdodD0iMiIgcng9IjEiIGZpbGw9IiM1NzVFNzUiLz48L3N2Zz4=';
const ARITY_PLUS_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCI+PGNpcmNsZSBjeD0iOSIgY3k9IjkiIHI9IjgiIGZpbGw9IiNmZmYiIHN0cm9rZT0iI2NjYyIvPjxyZWN0IHg9IjQuNSIgeT0iOCIgd2lkdGg9IjkiIGhlaWdodD0iMiIgcng9IjEiIGZpbGw9IiM1NzVFNzUiLz48cmVjdCB4PSI4IiB5PSI0LjUiIHdpZHRoPSIyIiBoZWlnaHQ9IjkiIHJ4PSIxIiBmaWxsPSIjNTc1RTc1Ii8+PC9zdmc+';
const ARITY_KW_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="26" height="16"><rect x="0.5" y="0.5" width="25" height="15" rx="7.5" fill="#fff" stroke="#ccc"/><text x="13" y="11.5" font-size="9" font-family="sans-serif" text-anchor="middle" fill="#575E75">+kw</text></svg>');

if (Blockly) {
  Blockly.Blocks['ir_name'] = {
    init() {
      // Traditional block-coding: a variable is a dropdown (FieldVariable) — pick/rename/create —
      // not a free-text field. Serializes as { ID: { id } } + a workspace variables map.
      this.appendDummyInput().appendField(new Blockly.FieldVariable('x'), 'ID');
      this.setOutput(true);
      this.setColour('#5b80a5');
      this.setTooltip('Variable');
    },
  };
  Blockly.Blocks['ir_const'] = {
    init() {
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('1'), 'VALUE');
      this.setOutput(true);
      this.setColour('#a55b80');
      this.setTooltip('Constant literal (JSON-encoded value)');
    },
  };
  // A rounded TEXT string literal: type the content directly between the quotes (no JSON quoting).
  // Round-trips to a string Constant. This is the block users plug into string args (filenames,
  // labels, modes) instead of typing "gray" into the generic const.
  Blockly.Blocks['ir_str'] = {
    init() {
      this.appendDummyInput()
        .appendField('“')
        .appendField(new Blockly.FieldTextInput(''), 'TEXT')
        .appendField('”');
      this.setOutput(true);
      this.setColour('#5ba55b');
      this.setTooltip('Text string');
    },
  };
  // Assignment with variable target arity (a = b = 1). itemCount_ targets are rebuilt
  // from extraState on load (BEFORE Blockly restores input connections), so every target
  // has a matching input and none are dropped through a real workspace save/load.
  Blockly.Blocks['ir_assign'] = {
    itemCount_: 1,
    init() {
      this.itemCount_ = 1;
      this.updateShape_();
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#5b5ba5');
      this.setTooltip('Assignment: targets = value');
    },
    saveExtraState() { return { n: this.itemCount_ }; },
    loadExtraState(state) {
      this.itemCount_ = (state && typeof state.n === 'number' && state.n > 0) ? state.n : 1;
      this.updateShape_();
    },
    updateShape_() {
      let i = 0;
      while (this.getInput('TARGET' + i)) { this.removeInput('TARGET' + i); i++; }
      if (this.getInput('VALUE')) this.removeInput('VALUE');
      for (let t = 0; t < this.itemCount_; t++) {
        const inp = this.appendValueInput('TARGET' + t);
        if (t > 0) inp.appendField('=');
      }
      this.appendValueInput('VALUE').appendField('=');
      this.setInputsInline(true);
    },
  };
}

if (Blockly) {
  // Variable-arity collection blocks (List/Tuple/Set): itemCount_ element value inputs,
  // rebuilt from extraState on load so no element is dropped through a real save/load.
  // minItems = 1 for ir_set: Python has no empty set literal (ast.unparse(Set([])) -> "{*()}",
  // which is unroundtrippable), so an empty set block is disallowed. List/Tuple allow 0.
  const defineEltsBlock = (type, open, close, colour, minItems = 0) => {
    Blockly.Blocks[type] = {
      itemCount_: minItems,
      init() {
        this.itemCount_ = minItems;
        this.updateShape_();
        this.setOutput(true);
        this.setColour(colour);
        this.setInputsInline(true);
      },
      saveExtraState() { return { n: this.itemCount_ }; },
      loadExtraState(state) {
        const n = (state && typeof state.n === 'number') ? state.n : minItems;
        this.itemCount_ = Math.max(minItems, n);
        this.updateShape_();
      },
      updateShape_() {
        let i = 0;
        while (this.getInput('ELT' + i)) { this.removeInput('ELT' + i); i++; }
        if (this.getInput('EMPTY')) this.removeInput('EMPTY');
        if (this.getInput('CLOSE')) this.removeInput('CLOSE');
        if (this.itemCount_ === 0) {
          this.appendDummyInput('EMPTY').appendField(open + close);
        } else {
          for (let t = 0; t < this.itemCount_; t++) {
            this.appendValueInput('ELT' + t).appendField(t === 0 ? open : ',');
          }
          this.appendDummyInput('CLOSE').appendField(close);
        }
      },
    };
  };
  defineEltsBlock('ir_list', '[', ']', '#4a90a4', 0);
  defineEltsBlock('ir_tuple', '(', ')', '#4a7a90', 0);
  defineEltsBlock('ir_set', '{', '}', '#7a4a90', 1);  // no empty set literal in Python

  // Dict: itemCount_ key:value pairs. A missing KEYi connection encodes ** unpacking.
  Blockly.Blocks['ir_dict'] = {
    itemCount_: 0,
    init() {
      this.itemCount_ = 0;
      this.updateShape_();
      this.setOutput(true);
      this.setColour('#90744a');
      this.setInputsInline(true);
    },
    saveExtraState() { return { n: this.itemCount_ }; },
    loadExtraState(state) {
      this.itemCount_ = (state && typeof state.n === 'number' && state.n >= 0) ? state.n : 0;
      this.updateShape_();
    },
    updateShape_() {
      let i = 0;
      while (this.getInput('KEY' + i) || this.getInput('VAL' + i)) {
        if (this.getInput('KEY' + i)) this.removeInput('KEY' + i);
        if (this.getInput('VAL' + i)) this.removeInput('VAL' + i);
        i++;
      }
      if (this.getInput('EMPTY')) this.removeInput('EMPTY');
      if (this.getInput('CLOSE')) this.removeInput('CLOSE');
      if (this.itemCount_ === 0) {
        this.appendDummyInput('EMPTY').appendField('{}');
      } else {
        for (let t = 0; t < this.itemCount_; t++) {
          this.appendValueInput('KEY' + t).appendField(t === 0 ? '{' : ',');
          this.appendValueInput('VAL' + t).appendField(':');
        }
        this.appendDummyInput('CLOSE').appendField('}');
      }
    },
  };
}

if (Blockly) {
  // Operator enum dropdowns: stored value = ast op node name, label = Python symbol.
  const BIN_OPS = [['+', 'Add'], ['-', 'Sub'], ['*', 'Mult'], ['/', 'Div'], ['//', 'FloorDiv'],
    ['%', 'Mod'], ['**', 'Pow'], ['<<', 'LShift'], ['>>', 'RShift'], ['|', 'BitOr'],
    ['^', 'BitXor'], ['&', 'BitAnd'], ['@', 'MatMult']];
  const UNARY_OPS = [['not ', 'Not'], ['-', 'USub'], ['+', 'UAdd'], ['~', 'Invert']];
  const BOOL_OPS = [['and', 'And'], ['or', 'Or']];
  const CMP_OPS = [['==', 'Eq'], ['!=', 'NotEq'], ['<', 'Lt'], ['<=', 'LtE'], ['>', 'Gt'],
    ['>=', 'GtE'], ['is', 'Is'], ['is not', 'IsNot'], ['in', 'In'], ['not in', 'NotIn']];

  Blockly.Blocks['ir_binop'] = {
    init() {
      this.appendValueInput('LEFT');
      this.appendValueInput('RIGHT').appendField(new Blockly.FieldDropdown(BIN_OPS), 'OP');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour('#5b67a5');
    },
  };
  Blockly.Blocks['ir_unaryop'] = {
    init() {
      this.appendValueInput('OPERAND').appendField(new Blockly.FieldDropdown(UNARY_OPS), 'OP');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour('#5b67a5');
    },
  };
  // a and b and c: variable-arity values joined by a single and/or dropdown.
  Blockly.Blocks['ir_boolop'] = {
    itemCount_: 2,
    init() {
      this.itemCount_ = 2;
      this.updateShape_();
      this.setOutput(true);
      this.setColour('#5b67a5');
      this.setInputsInline(true);
    },
    saveExtraState() { return { n: this.itemCount_ }; },
    loadExtraState(state) {
      this.itemCount_ = (state && typeof state.n === 'number' && state.n >= 2) ? state.n : 2;
      this.updateShape_();
    },
    updateShape_() {
      let i = 0;
      while (this.getInput('VAL' + i)) { this.removeInput('VAL' + i); i++; }
      for (let t = 0; t < this.itemCount_; t++) {
        const inp = this.appendValueInput('VAL' + t);
        if (t === 0) inp.appendField(new Blockly.FieldDropdown(BOOL_OPS), 'OP');
      }
    },
  };
  // left + N (op, comparator) pairs for chained comparisons (a < b <= c).
  Blockly.Blocks['ir_compare'] = {
    itemCount_: 1,
    init() {
      this.itemCount_ = 1;
      this.updateShape_();
      this.setOutput(true);
      this.setColour('#5b67a5');
      this.setInputsInline(true);
    },
    saveExtraState() { return { n: this.itemCount_ }; },
    loadExtraState(state) {
      this.itemCount_ = (state && typeof state.n === 'number' && state.n >= 1) ? state.n : 1;
      this.updateShape_();
    },
    updateShape_() {
      if (this.getInput('LEFT')) this.removeInput('LEFT');
      let i = 0;
      while (this.getInput('CMP' + i)) { this.removeInput('CMP' + i); i++; }
      this.appendValueInput('LEFT');
      for (let t = 0; t < this.itemCount_; t++) {
        this.appendValueInput('CMP' + t).appendField(new Blockly.FieldDropdown(CMP_OPS), 'OP' + t);
      }
    },
  };
}

if (Blockly) {
  const AUG_OPS = [['+=', 'Add'], ['-=', 'Sub'], ['*=', 'Mult'], ['/=', 'Div'], ['//=', 'FloorDiv'],
    ['%=', 'Mod'], ['**=', 'Pow'], ['<<=', 'LShift'], ['>>=', 'RShift'], ['|=', 'BitOr'],
    ['^=', 'BitXor'], ['&=', 'BitAnd'], ['@=', 'MatMult']];
  Blockly.Blocks['ir_augassign'] = {
    init() {
      this.appendValueInput('TARGET');
      this.appendValueInput('VALUE').appendField(new Blockly.FieldDropdown(AUG_OPS), 'OP');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setColour('#5b5ba5');
    },
  };
  // Annotated assignment: TARGET : ANNOTATION [= VALUE]. VALUE may be left unconnected
  // (`x: int`). `simple` (0/1) preserved via extraState for the parenthesized-target case.
  Blockly.Blocks['ir_annassign'] = {
    simple_: 1,
    init() {
      this.appendValueInput('TARGET');
      this.appendValueInput('ANNOTATION').appendField(':');
      this.appendValueInput('VALUE').appendField('=');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setColour('#5b5ba5');
    },
    saveExtraState() { return { simple: this.simple_ }; },
    loadExtraState(state) {
      this.simple_ = (state && typeof state.simple === 'number') ? state.simple : 1;
    },
  };
}

if (Blockly) {
  Blockly.Blocks['ir_attribute'] = {
    dotted_: null,
    attr_: 'attr',
    init() {
      this.dotted_ = null;
      this.attr_ = 'attr';
      this.updateShape_();          // updateShape_ also sets the colour (emerald if a recognized library value)
      this.setInputsInline(true);
      this.setOutput(true);
    },
    // An attribute/method name is a fixed, non-editable label (like a function name) — never an
    // editable text field. A module-rooted chain (cv2.imread) is one whole dotted label; a general
    // access on a variable/expression keeps the receiver as a VALUE input + a fixed `.name` label.
    saveExtraState() { return this.dotted_ ? { dotted: this.dotted_ } : { attr: this.attr_ }; },
    loadExtraState(state) {
      this.dotted_ = (state && state.dotted) || null;
      this.attr_ = (state && state.attr) || 'attr';
      this.updateShape_();
    },
    updateShape_() {
      if (this.getInput('VALUE')) this.removeInput('VALUE');
      if (this.getInput('ATTRROW')) this.removeInput('ATTRROW');
      const reg = (typeof window !== 'undefined' ? window : global).BlockPyLibRegistry;
      let colour = '#a07a4a';
      if (this.dotted_) {
        this.appendDummyInput('ATTRROW').appendField(String(this.dotted_));
        // A recognized module constant (cv2.IMREAD_COLOR) gets its library colour — the same look the
        // toolbox palette shows — so a converted constant and a dragged one are visually identical.
        const c = reg && reg.findConst && reg.findConst(String(this.dotted_));
        if (c) colour = c.colour || '#009688';
      } else {
        this.appendValueInput('VALUE');
        this.appendDummyInput('ATTRROW').appendField('.' + String(this.attr_));
        // Feature 1: a recognized class property (name-based) gets its library colour too.
        const a = reg && reg.findAttr && reg.findAttr(String(this.attr_));
        if (a) colour = a.colour || '#009688';
      }
      this.setColour(colour);
    },
  };
  Blockly.Blocks['ir_subscript'] = {
    init() {
      this.appendValueInput('VALUE');
      this.appendValueInput('SLICE').appendField('[');
      this.appendDummyInput().appendField(']');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour('#a07a4a');
    },
  };
  // Slice with optional lower:upper:step inputs (a[1:], a[::2], a[:]).
  Blockly.Blocks['ir_slice'] = {
    init() {
      this.appendValueInput('LOWER');
      this.appendValueInput('UPPER').appendField(':');
      this.appendValueInput('STEP').appendField(':');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour('#a07a4a');
    },
  };
  Blockly.Blocks['ir_starred'] = {
    init() {
      this.appendValueInput('VALUE').appendField('*');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour('#a07a4a');
    },
  };
}

if (Blockly) {
  // Expression statement: a value block used as a statement (print(x)).
  Blockly.Blocks['ir_exprstmt'] = {
    init() {
      this.appendValueInput('VALUE');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#6a8a5b');
    },
  };
  // Call: FUNC + nargs_ positional inputs + kw_ keyword inputs. Keyword names (and the **
  // marker as null) live in extraState so they survive a real save/load; the keyword values
  // are KW* inputs. Rebuilt before connections are restored on load.
  Blockly.Blocks['ir_call'] = {
    nargs_: 0,
    kw_: [],
    funcName_: null,
    method_: null,
    stmt_: false,
    init() {
      this.nargs_ = 0;
      this.kw_ = [];
      this.funcName_ = null;
      this.method_ = null;
      this.stmt_ = false;
      this.updateShape_();
      this.updateConnections_();
      this.setColour('#6a8a5b');
      this.setInputsInline(true);
    },
    // A call is EITHER a reporter (rounded output — used as a value: x = len(s)) or a command (stack
    // block — used as a statement: print(...)). One block, shape chosen by the stmt flag.
    updateConnections_() {
      this.setOutput(false);
      this.setPreviousStatement(false);
      this.setNextStatement(false);
      if (this.stmt_) {
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
      } else {
        this.setOutput(true);
      }
    },
    saveExtraState() { return { nargs: this.nargs_, kw: this.kw_, funcName: this.funcName_, method: this.method_, stmt: this.stmt_ }; },
    loadExtraState(state) {
      this.nargs_ = (state && typeof state.nargs === 'number') ? state.nargs : 0;
      this.kw_ = (state && Array.isArray(state.kw)) ? state.kw : [];
      this.funcName_ = (state && state.funcName !== undefined) ? state.funcName : null;
      this.method_ = (state && state.method !== undefined) ? state.method : null;
      this.stmt_ = !!(state && state.stmt);
      this.updateShape_();
      this.updateConnections_();
    },
    updateShape_() {
      // Preserve the receiver variable selection across reshapes (removeInput destroys the field).
      const recvVal = (this.getField && this.getField('RECV')) ? this.getField('RECV').getValue() : null;
      if (this.getInput('FUNC')) this.removeInput('FUNC');
      if (this.getInput('RECV')) this.removeInput('RECV');
      let i = 0;
      while (this.getInput('ARG' + i)) { this.removeInput('ARG' + i); i++; }
      i = 0;
      while (this.getInput('KW' + i)) { this.removeInput('KW' + i); i++; }
      if (this.getInput('CLOSE')) this.removeInput('CLOSE');
      // Unified styling: if this attribute call (`<recv>.<method>`) is a REGISTERED library call,
      // render it emerald with per-slot parameter-name labels — the same look the toolbox library
      // tab shows — so converting from Python and dragging from the toolbox produce identical blocks.
      // Name-based lookup (ignores arity/keywords) so optional/keyword-arg calls still style.
      const reg = (typeof window !== 'undefined' ? window : global).BlockPyLibRegistry;
      let recvName = recvVal;
      if (recvVal && this.workspace && this.workspace.getVariableById) {
        const v = this.workspace.getVariableById(recvVal);
        if (v) recvName = v.name;
      }
      // A library call shows up two ways: an instance method on a variable receiver (method_ set,
      // e.g. device.move_to) OR an imported module function as one dotted label (funcName_ =
      // "math.sqrt"/"json.dumps"). Style both. A plain funcName (print, len) has no dot → not a lib.
      let lib = null;
      if (reg && reg.findLibCall) {
        if (this.method_ != null) {
          lib = reg.findLibCall(recvName, String(this.method_));
        } else if (this.funcName_ != null && String(this.funcName_).indexOf('.') >= 0) {
          const fn = String(this.funcName_);
          const d = fn.lastIndexOf('.');
          lib = reg.findLibCall(fn.slice(0, d), fn.slice(d + 1));
        }
      }
      // Three callee shapes, all ONE block: a fixed name label (print, len); a method on a variable
      // receiver (`<var>.method` — var is a native dropdown, method a fixed label); or a complex
      // callee that keeps a value input (returned callable, nested attribute chain).
      if (this.funcName_ !== null && this.funcName_ !== undefined) {
        this.appendDummyInput('FUNC').appendField(String(this.funcName_));
      } else if (this.method_ !== null && this.method_ !== undefined) {
        const f = new Blockly.FieldVariable('obj');
        this.appendDummyInput('RECV').appendField(f, 'RECV').appendField('.' + String(this.method_));
        if (recvVal) f.setValue(recvVal);
      } else {
        this.appendValueInput('FUNC');
      }
      // Positional slots carry the introspected parameter name (x, y, …) for a known library call;
      // each keyword slot has an EDITABLE name field bound to kw_ so the user can type `verbose=`.
      const params = lib ? lib.params : null;
      const self = this;
      if (this.nargs_ === 0 && this.kw_.length === 0) {
        this.appendDummyInput('CLOSE').appendField('()');
      } else {
        for (let t = 0; t < this.nargs_; t++) {
          const inp = this.appendValueInput('ARG' + t).appendField(t === 0 ? '(' : ',');
          if (params && params[t]) inp.appendField(String(params[t]));
        }
        for (let t = 0; t < this.kw_.length; t++) {
          const name = this.kw_[t];
          const lead = (t === 0 && this.nargs_ === 0) ? '(' : ',';
          if (name === null || name === undefined) {
            this.appendValueInput('KW' + t).appendField(lead + '**');
          } else {
            const idx = t;
            const f = new Blockly.FieldTextInput(String(name), (v) => { self.kw_[idx] = v; return v; });
            this.appendValueInput('KW' + t).appendField(lead).appendField(f, 'KWNAME' + t).appendField('=');
          }
        }
        this.appendDummyInput('CLOSE').appendField(')');
      }
      this.appendCallButtons_();
      this.setColour(lib ? lib.colour : '#6a8a5b');
    },
    // ── interactive argument editing: [−] [+] [+kw] on the trailing input ───────────
    appendCallButtons_() {
      const close = this.getInput('CLOSE');
      if (!close || !Blockly.FieldImage) return;
      if (this.nargs_ + this.kw_.length > 0) {
        close.appendField(new Blockly.FieldImage(ARITY_MINUS_SVG, 16, 16, '−', function () {
          const b = this.getSourceBlock && this.getSourceBlock(); if (b) b.changeArgs_(-1);
        }), 'BTN_MINUS');
      }
      close.appendField(new Blockly.FieldImage(ARITY_PLUS_SVG, 16, 16, '+', function () {
        const b = this.getSourceBlock && this.getSourceBlock(); if (b) b.changeArgs_(1);
      }), 'BTN_PLUS');
      close.appendField(new Blockly.FieldImage(ARITY_KW_SVG, 26, 16, '+kw', function () {
        const b = this.getSourceBlock && this.getSourceBlock(); if (b) b.addKw_();
      }), 'BTN_KW');
    },
    changeArgs_(delta) {
      if (delta < 0) {
        if (this.kw_.length > 0) this.kw_ = this.kw_.slice(0, -1);  // remove a keyword before a positional
        else if (this.nargs_ > 0) this.nargs_ -= 1;
        else return;
      } else {
        this.nargs_ += 1;
      }
      this.reshapePreserving_();
    },
    addKw_() {
      this.kw_ = this.kw_.concat(['name']);
      this.reshapePreserving_();
    },
    // Rebuild the shape while keeping user-attached blocks; new empty value slots get an ir_name shadow.
    reshapePreserving_() {
      const ev = Blockly.Events;
      const prevGroup = (ev && ev.getGroup && ev.getGroup()) || false;
      if (ev && ev.setGroup) ev.setGroup(true);
      const saved = {};
      for (const input of this.inputList) {
        if (input.connection && input.connection.targetConnection) {
          const tb = input.connection.targetBlock();
          if (tb && !tb.isShadow()) saved[input.name] = input.connection.targetConnection;   // keep real children only
        }
      }
      this.updateShape_();
      for (const nm in saved) {
        const input = this.getInput(nm);
        if (input && input.connection && !input.connection.targetConnection) {
          try { input.connection.connect(saved[nm]); } catch (e) { /* slot gone */ }
        }
      }
      for (const input of this.inputList) {
        if (input.connection && !input.connection.targetConnection && /^(ARG|KW)\d+$/.test(input.name)) {
          try { input.connection.setShadowState({ type: 'ir_name', fields: { ID: 'arg' } }); } catch (e) { /* */ }
        }
      }
      if (this.rendered && typeof this.render === 'function') this.render();
      if (ev && ev.setGroup) ev.setGroup(prevGroup);
    },
  };
}

if (Blockly) {
  const stmt = (b, colour) => {
    b.setPreviousStatement(true, null);
    b.setNextStatement(true, null);
    b.setColour(colour);
  };
  // if/while/for/asyncfor: the `else` branch is OPTIONAL. extraState.hasElse drives whether the
  // ORELSE statement input renders, so an unused else never shows (a plain if and Python's rare
  // for/while-else both round-trip; the toolbox offers explicit with-else variants for authoring).
  const withOptionalElse = (buildHeader) => ({
    hasElse_: false,
    init() {
      buildHeader.call(this);
      this.hasElse_ = false;
      this.updateShape_();
      stmt(this, '#a0734a');
    },
    saveExtraState() { return { hasElse: this.hasElse_ }; },
    loadExtraState(state) { this.hasElse_ = !!(state && state.hasElse); this.updateShape_(); },
    updateShape_() {
      const has = !!this.getInput('ORELSE');
      if (this.hasElse_ && !has) this.appendStatementInput('ORELSE').appendField('else');
      else if (!this.hasElse_ && has) this.removeInput('ORELSE');
    },
  });
  Blockly.Blocks['ir_if'] = withOptionalElse(function () {
    this.appendValueInput('TEST').appendField('if');
    this.appendStatementInput('BODY');
  });
  Blockly.Blocks['ir_while'] = withOptionalElse(function () {
    this.appendValueInput('TEST').appendField('while');
    this.appendStatementInput('BODY');
  });
  // For / AsyncFor share one header; async-ness is the block type.
  const forHeader = (isAsync) => function () {
    this.appendValueInput('TARGET').appendField(isAsync ? 'async for' : 'for');
    this.appendValueInput('ITER').appendField('in');
    this.appendStatementInput('BODY');
  };
  Blockly.Blocks['ir_for'] = withOptionalElse(forHeader(false));
  Blockly.Blocks['ir_asyncfor'] = withOptionalElse(forHeader(true));
  Blockly.Blocks['ir_pass'] = { init() { this.appendDummyInput().appendField('pass'); stmt(this, '#888888'); } };
  Blockly.Blocks['ir_break'] = { init() { this.appendDummyInput().appendField('break'); stmt(this, '#a0734a'); } };
  Blockly.Blocks['ir_continue'] = { init() { this.appendDummyInput().appendField('continue'); stmt(this, '#a0734a'); } };
}

if (Blockly) {
  const stmt = (b, colour) => {
    b.setPreviousStatement(true, null);
    b.setNextStatement(true, null);
    b.setColour(colour);
  };
  // del a, b — variable-arity Store-context targets (count in extraState).
  Blockly.Blocks['ir_delete'] = {
    itemCount_: 1,
    init() { this.itemCount_ = 1; this.updateShape_(); stmt(this, '#a0734a'); this.setInputsInline(true); },
    saveExtraState() { return { n: this.itemCount_ }; },
    loadExtraState(state) {
      this.itemCount_ = (state && typeof state.n === 'number' && state.n >= 1) ? state.n : 1;
      this.updateShape_();
    },
    updateShape_() {
      let i = 0;
      while (this.getInput('TARGET' + i)) { this.removeInput('TARGET' + i); i++; }
      for (let t = 0; t < this.itemCount_; t++) {
        this.appendValueInput('TARGET' + t).appendField(t === 0 ? 'del' : ',');
      }
    },
  };
  // raise [EXC [from CAUSE]] — both optional value inputs.
  Blockly.Blocks['ir_raise'] = {
    init() {
      this.appendValueInput('EXC').appendField('raise');
      this.appendValueInput('CAUSE').appendField('from');
      this.setInputsInline(true);
      stmt(this, '#a0734a');
    },
  };
  // assert TEST [, MSG]
  Blockly.Blocks['ir_assert'] = {
    init() {
      this.appendValueInput('TEST').appendField('assert');
      this.appendValueInput('MSG').appendField(',');
      this.setInputsInline(true);
      stmt(this, '#a0734a');
    },
  };
  // with CTX [as VAR], ...: BODY — items_ is [{as}], so save/load rebuilds CTX<i>/VAR<i>.
  // With / AsyncWith share the factory; async-ness is the block type (isAsync const).
  const withDef = (isAsync) => ({
    items_: [],
    init() { this.items_ = [{ as: false }]; this.updateShape_(); stmt(this, '#a0734a'); },
    saveExtraState() { return { items: this.items_ }; },
    loadExtraState(s) {
      this.items_ = (s && Array.isArray(s.items) && s.items.length) ? s.items : [{ as: false }];
      this.updateShape_();
    },
    updateShape_() {
      this.inputList.map((inp) => inp.name).filter(Boolean).forEach((nm) => this.removeInput(nm));
      this.items_.forEach((it, i) => {
        this.appendValueInput('CTX' + i).appendField(i === 0 ? (isAsync ? 'async with' : 'with') : ',');
        if (it.as) this.appendValueInput('VAR' + i).appendField('as');
      });
      this.appendStatementInput('BODY');
    },
  });
  Blockly.Blocks['ir_with'] = withDef(false);
  Blockly.Blocks['ir_asyncwith'] = withDef(true);
  // try: BODY (except[*] [TYPE [as name]]: HBODY)* [else: ELSE] [finally: FINALLY].
  // handlers_ is [{type:bool, name:str|null}]; star_ toggles except / except*. Every input is
  // named (incl. the bare-except row EXCROW<i>) so the rebuild-on-load removes them all cleanly
  // (unnamed dummies would leak and duplicate). TRYROW is the stable kept row.
  const tryInit = (star) => ({
    handlers_: [], star_: star,
    init() {
      this.handlers_ = [{ type: false, name: null }]; this.star_ = star;
      this.appendDummyInput('TRYROW').appendField('try');
      this.updateShape_(); stmt(this, '#a0734a');
    },
    saveExtraState() { return { handlers: this.handlers_ }; },
    loadExtraState(s) {
      // An empty handlers array is a VALID restored state (finally-only / else-only try), so
      // only fall back to the new-block default when handlers is absent, never when it is [].
      this.handlers_ = (s && Array.isArray(s.handlers)) ? s.handlers : [{ type: false, name: null }];
      this.updateShape_();
    },
    updateShape_() {
      this.inputList.map((inp) => inp.name).filter((nm) => nm && nm !== 'TRYROW')
        .forEach((nm) => this.removeInput(nm));
      this.appendStatementInput('BODY');
      const kw = this.star_ ? 'except*' : 'except';
      this.handlers_.forEach((h, i) => {
        if (h.type) {
          const row = this.appendValueInput('TYPE' + i).appendField(kw);
          if (h.name !== null && h.name !== undefined) row.appendField('as ' + h.name);
        } else {
          this.appendDummyInput('EXCROW' + i).appendField(kw + ':');
        }
        this.appendStatementInput('HBODY' + i);
      });
      this.appendStatementInput('ELSE').appendField('else');
      this.appendStatementInput('FINALLY').appendField('finally');
    },
  });
  Blockly.Blocks['ir_try'] = tryInit(false);
  Blockly.Blocks['ir_trystar'] = tryInit(true);

  // match SUBJECT: (case <C<i>E<k> exprs> [if GUARD<i>]: BODY<i>)+. The pattern structure (all
  // HELPER nodes) lives in extraState cases_=[{pattern, nexpr, guard}]; only the embedded
  // expressions surface as inputs. SUBJECT is the stable kept row; CASEROW<i> are named so the
  // rebuild-on-load removes them cleanly.
  Blockly.Blocks['ir_match'] = {
    cases_: [],
    init() {
      this.cases_ = [];
      this.appendValueInput('SUBJECT').appendField('match');
      this.updateShape_();
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#a0734a');
    },
    saveExtraState() { return { cases: this.cases_ }; },
    loadExtraState(s) {
      this.cases_ = (s && Array.isArray(s.cases)) ? s.cases : [];
      this.updateShape_();
    },
    updateShape_() {
      this.inputList.map((inp) => inp.name).filter((nm) => nm && nm !== 'SUBJECT')
        .forEach((nm) => this.removeInput(nm));
      this.cases_.forEach((c, i) => {
        this.appendDummyInput('CASEROW' + i).appendField('case');
        for (let k = 0; k < (c.nexpr || 0); k++) this.appendValueInput('C' + i + 'E' + k);
        if (c.guard) this.appendValueInput('GUARD' + i).appendField('if');
        this.appendStatementInput('BODY' + i);
      });
    },
  };
}

if (Blockly) {
  // Ternary: BODY if TEST else ORELSE.
  Blockly.Blocks['ir_ifexp'] = {
    init() {
      this.appendValueInput('BODY');
      this.appendValueInput('TEST').appendField('if');
      this.appendValueInput('ORELSE').appendField('else');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour('#5b80a5');
    },
  };

  // Comprehension family (list/set/gen/dict). gens_ is [{ifs:<count>, async:<bool>}] so the
  // mutator rebuilds TARGET<i>/ITER<i>/IF<i>_<j> inputs on a real load. The element row is ELT
  // (or KEY:VAL for dict). OPEN is the stable kept row carrying the opening bracket.
  const OPEN = { list: '[', set: '{', gen: '(', dict: '{' };
  const compBlockDef = (kind) => ({
    gens_: [],
    init() {
      this.gens_ = [{ ifs: 0, async: false }];
      this.appendDummyInput('OPEN').appendField(OPEN[kind]);
      this.updateShape_();
      this.setOutput(true);
      this.setColour('#5b80a5');
      this.setInputsInline(true);
    },
    saveExtraState() { return { gens: this.gens_ }; },
    loadExtraState(s) {
      this.gens_ = (s && Array.isArray(s.gens) && s.gens.length) ? s.gens : [{ ifs: 0, async: false }];
      this.updateShape_();
    },
    updateShape_() {
      this.inputList.map((inp) => inp.name).filter((nm) => nm && nm !== 'OPEN')
        .forEach((nm) => this.removeInput(nm));
      if (kind === 'dict') {
        this.appendValueInput('KEY');
        this.appendValueInput('VAL').appendField(':');
      } else {
        this.appendValueInput('ELT');
      }
      this.gens_.forEach((g, i) => {
        this.appendValueInput('TARGET' + i).appendField(g.async ? 'async for' : 'for');
        this.appendValueInput('ITER' + i).appendField('in');
        for (let j = 0; j < (g.ifs || 0); j++) this.appendValueInput('IF' + i + '_' + j).appendField('if');
      });
    },
  });
  Blockly.Blocks['ir_listcomp'] = compBlockDef('list');
  Blockly.Blocks['ir_setcomp'] = compBlockDef('set');
  Blockly.Blocks['ir_genexp'] = compBlockDef('gen');
  Blockly.Blocks['ir_dictcomp'] = compBlockDef('dict');

  // Async / generator value expressions.
  const exprPrefix = (type, kw, colour) => {
    Blockly.Blocks[type] = {
      init() {
        this.appendValueInput('VALUE').appendField(kw);
        this.setInputsInline(true);
        this.setOutput(true);
        this.setColour(colour);
      },
    };
  };
  exprPrefix('ir_await', 'await', '#5b80a5');
  exprPrefix('ir_yieldfrom', 'yield from', '#5b80a5');
  // yield's value is optional (bare `yield`); the empty VALUE input is simply left unconnected.
  exprPrefix('ir_yield', 'yield', '#5b80a5');
  // Walrus TARGET := VALUE.
  Blockly.Blocks['ir_namedexpr'] = {
    init() {
      this.appendValueInput('TARGET');
      this.appendValueInput('VALUE').appendField(':=');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour('#5b80a5');
    },
  };

  // f-string: VAL<i> inputs are the ordered pieces (string Constants + ir_formattedvalue
  // interpolations). itemCount_ may be 0 (empty f""). OPEN is the stable kept label row.
  Blockly.Blocks['ir_joinedstr'] = {
    itemCount_: 0,
    init() {
      this.itemCount_ = 0;
      this.appendDummyInput('OPEN').appendField('f-str');
      this.updateShape_();
      this.setOutput(true);
      this.setColour('#a55b80');
      this.setInputsInline(true);
    },
    saveExtraState() { return { n: this.itemCount_ }; },
    loadExtraState(s) {
      this.itemCount_ = (s && typeof s.n === 'number') ? s.n : 0;
      this.updateShape_();
    },
    updateShape_() {
      this.inputList.map((inp) => inp.name).filter((nm) => nm && nm !== 'OPEN')
        .forEach((nm) => this.removeInput(nm));
      for (let i = 0; i < this.itemCount_; i++) this.appendValueInput('VAL' + i);
    },
  };

  // FormattedValue (HELPER, only inside ir_joinedstr): VALUE expr + optional conversion label
  // (!s/!r/!a, conv_ int) + optional SPEC (a nested ir_joinedstr format spec). VALUE is kept.
  const CONV = { 115: '!s', 114: '!r', 97: '!a' };
  Blockly.Blocks['ir_formattedvalue'] = {
    conv_: -1, spec_: false,
    init() {
      this.conv_ = -1; this.spec_ = false;
      this.appendValueInput('VALUE').appendField('{');
      this.updateShape_();
      this.setOutput(true);
      this.setColour('#a55b80');
      this.setInputsInline(true);
    },
    saveExtraState() { return { conv: this.conv_, spec: this.spec_ }; },
    loadExtraState(s) {
      this.conv_ = (s && typeof s.conv === 'number') ? s.conv : -1;
      this.spec_ = !!(s && s.spec);
      this.updateShape_();
    },
    updateShape_() {
      this.inputList.map((inp) => inp.name).filter((nm) => nm && nm !== 'VALUE')
        .forEach((nm) => this.removeInput(nm));
      const label = CONV[this.conv_];
      if (label) this.appendDummyInput('CONVROW').appendField(label);
      if (this.spec_) this.appendValueInput('SPEC').appendField(':');
    },
  };
}

if (Blockly) {
  // Rebuild ANN<i>/DEF<i> inputs from a param list (shared by funcdef + lambda). Removes
  // every input except the named stable rows, then recreates the signature inputs so a real
  // Blockly load restores connections to matching names.
  const rebuildParamInputs = (block, params, keep) => {
    block.inputList.map((inp) => inp.name).filter((nm) => nm && keep.indexOf(nm) < 0)
      .forEach((nm) => block.removeInput(nm));
    params.forEach((p, i) => {
      if (p.ann) block.appendValueInput('ANN' + i).appendField(p.name + ':');
      if (p.def) block.appendValueInput('DEF' + i).appendField(p.name + '=');
    });
  };

  // FunctionDef / AsyncFunctionDef share the factory; async-ness is the block type. The keyword
  // ('def' / 'async def') lives in the stable NAMEROW set once in init from the isAsync const.
  const funcdefDef = (isAsync) => ({
    params_: [], tparams_: [], ndec_: 0, ret_: false,
    init() {
      this.params_ = []; this.tparams_ = []; this.ndec_ = 0; this.ret_ = false;
      this.appendDummyInput('NAMEROW').appendField(isAsync ? 'async def' : 'def')
        .appendField(new Blockly.FieldTextInput('f'), 'NAME');
      this.updateShape_();
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9a6a8a');
    },
    saveExtraState() {
      return { params: this.params_, tparams: this.tparams_, ndec: this.ndec_, ret: this.ret_ };
    },
    loadExtraState(s) {
      this.params_ = (s && Array.isArray(s.params)) ? s.params : [];
      this.tparams_ = (s && Array.isArray(s.tparams)) ? s.tparams : [];
      this.ndec_ = (s && typeof s.ndec === 'number') ? s.ndec : 0;
      this.ret_ = !!(s && s.ret);
      this.updateShape_();
    },
    updateShape_() {
      // remove everything except NAMEROW, then rebuild decorators, type params, params,
      // returns, body
      this.inputList.map((inp) => inp.name).filter((nm) => nm && nm !== 'NAMEROW')
        .forEach((nm) => this.removeInput(nm));
      for (let i = 0; i < this.ndec_; i++) this.appendValueInput('DEC' + i).appendField('@');
      this.tparams_.forEach((t, i) => {
        if (t.bound) this.appendValueInput('TPB' + i).appendField('[' + t.name + ':');
        if (t.def) this.appendValueInput('TPD' + i).appendField('[' + t.name + '=');
      });
      this.params_.forEach((p, i) => {
        if (p.ann) this.appendValueInput('ANN' + i).appendField(p.name + ':');
        if (p.def) this.appendValueInput('DEF' + i).appendField(p.name + '=');
      });
      if (this.ret_) this.appendValueInput('RETURNS').appendField('->');
      this.appendStatementInput('BODY');
    },
  });
  Blockly.Blocks['ir_funcdef'] = funcdefDef(false);
  Blockly.Blocks['ir_asyncfuncdef'] = funcdefDef(true);

  // ClassDef: NAME + decorators + type params + bases + keywords (metaclass/**), then BODY.
  // Variable-arity bits (nbases_, kw_, tparams_, ndec_) live in extraState so a real
  // save/load rebuilds the matching inputs before connections are restored.
  Blockly.Blocks['ir_classdef'] = {
    nbases_: 0, kw_: [], tparams_: [], ndec_: 0,
    init() {
      this.nbases_ = 0; this.kw_ = []; this.tparams_ = []; this.ndec_ = 0;
      this.appendDummyInput('NAMEROW').appendField('class')
        .appendField(new Blockly.FieldTextInput('C'), 'NAME');
      this.updateShape_();
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9a6a8a');
    },
    saveExtraState() {
      return { nbases: this.nbases_, kw: this.kw_, tparams: this.tparams_, ndec: this.ndec_ };
    },
    loadExtraState(s) {
      this.nbases_ = (s && typeof s.nbases === 'number') ? s.nbases : 0;
      this.kw_ = (s && Array.isArray(s.kw)) ? s.kw : [];
      this.tparams_ = (s && Array.isArray(s.tparams)) ? s.tparams : [];
      this.ndec_ = (s && typeof s.ndec === 'number') ? s.ndec : 0;
      this.updateShape_();
    },
    updateShape_() {
      this.inputList.map((inp) => inp.name).filter((nm) => nm && nm !== 'NAMEROW')
        .forEach((nm) => this.removeInput(nm));
      for (let i = 0; i < this.ndec_; i++) this.appendValueInput('DEC' + i).appendField('@');
      this.tparams_.forEach((t, i) => {
        if (t.bound) this.appendValueInput('TPB' + i).appendField('[' + t.name + ':');
        if (t.def) this.appendValueInput('TPD' + i).appendField('[' + t.name + '=');
      });
      for (let i = 0; i < this.nbases_; i++) {
        this.appendValueInput('BASE' + i).appendField(i === 0 ? '(' : ',');
      }
      for (let i = 0; i < this.kw_.length; i++) {
        const name = this.kw_[i];
        const label = (name === null || name === undefined) ? '**' : name + '=';
        this.appendValueInput('KW' + i)
          .appendField((i === 0 && this.nbases_ === 0) ? '(' + label : ',' + label);
      }
      this.appendStatementInput('BODY');
    },
  };

  Blockly.Blocks['ir_lambda'] = {
    params_: [],
    init() {
      this.params_ = [];
      this.appendDummyInput('LROW').appendField('lambda');
      this.updateShape_();
      this.setOutput(true);
      this.setColour('#9a6a8a');
    },
    saveExtraState() { return { params: this.params_ }; },
    loadExtraState(s) {
      this.params_ = (s && Array.isArray(s.params)) ? s.params : [];
      this.updateShape_();
    },
    updateShape_() {
      if (this.getInput('BODY')) this.removeInput('BODY');
      rebuildParamInputs(this, this.params_, ['LROW']);
      this.appendValueInput('BODY').appendField(':');
    },
  };

  Blockly.Blocks['ir_return'] = {
    init() {
      this.appendValueInput('VALUE').appendField('return');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9a6a8a');
    },
  };
  Blockly.Blocks['ir_global'] = {
    init() {
      this.appendDummyInput().appendField('global')
        .appendField(new Blockly.FieldTextInput('x'), 'NAMES');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#888888');
    },
  };
  // type NAME[<tparams>] = VALUE (PEP-695). tparams_ mirrors funcdef/classdef; NAMEROW is the
  // stable kept row. The TPB<i>/TPD<i> tparam inputs precede the VALUE expr.
  Blockly.Blocks['ir_typealias'] = {
    tparams_: [],
    init() {
      this.tparams_ = [];
      this.appendDummyInput('NAMEROW').appendField('type')
        .appendField(new Blockly.FieldTextInput('X'), 'NAME');
      this.updateShape_();
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9a6a8a');
    },
    saveExtraState() { return { tparams: this.tparams_ }; },
    loadExtraState(s) {
      this.tparams_ = (s && Array.isArray(s.tparams)) ? s.tparams : [];
      this.updateShape_();
    },
    updateShape_() {
      this.inputList.map((inp) => inp.name).filter((nm) => nm && nm !== 'NAMEROW')
        .forEach((nm) => this.removeInput(nm));
      this.tparams_.forEach((t, i) => {
        if (t.bound) this.appendValueInput('TPB' + i).appendField('[' + t.name + ':');
        if (t.def) this.appendValueInput('TPD' + i).appendField('[' + t.name + '=');
      });
      this.appendValueInput('VALUE').appendField('=');
    },
  };
  Blockly.Blocks['ir_nonlocal'] = {
    init() {
      this.appendDummyInput().appendField('nonlocal')
        .appendField(new Blockly.FieldTextInput('x'), 'NAMES');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#888888');
    },
  };
  // import a, b as c — alias list is a single text field (alias has no own block).
  Blockly.Blocks['ir_import'] = {
    init() {
      this.appendDummyInput().appendField('import')
        .appendField(new Blockly.FieldTextInput('os'), 'NAMES');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#888888');
    },
  };
  // from <MODULE> import <NAMES> — MODULE carries leading dots for relative imports.
  Blockly.Blocks['ir_importfrom'] = {
    init() {
      this.appendDummyInput().appendField('from')
        .appendField(new Blockly.FieldTextInput('os'), 'MODULE')
        .appendField('import')
        .appendField(new Blockly.FieldTextInput('path'), 'NAMES');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#888888');
    },
  };
}

if (typeof module !== 'undefined') module.exports = {};
