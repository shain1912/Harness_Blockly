/* irBlocks.js — Blockly.Blocks visual definitions for IR block types (side-effect load).
 * Generators are intentionally NOT defined here: block -> Python goes block -> IR ->
 * ast.unparse (single IR), not via Blockly.Python. These defs only make blocks render.
 */

const Blockly = (typeof window !== 'undefined' && window.Blockly);
if (Blockly) {
  Blockly.Blocks['ir_name'] = {
    init() {
      this.appendDummyInput().appendField(new Blockly.FieldTextInput('x'), 'ID');
      this.setOutput(true);
      this.setColour('#5b80a5');
      this.setTooltip('Name (variable reference)');
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
        if (this.itemCount_ === 0) {
          this.appendDummyInput('EMPTY').appendField(open + close);
        } else {
          for (let t = 0; t < this.itemCount_; t++) {
            this.appendValueInput('ELT' + t).appendField(t === 0 ? open : ',');
          }
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
      if (this.itemCount_ === 0) {
        this.appendDummyInput('EMPTY').appendField('{}');
      } else {
        for (let t = 0; t < this.itemCount_; t++) {
          this.appendValueInput('KEY' + t).appendField(t === 0 ? '{' : ',');
          this.appendValueInput('VAL' + t).appendField(':');
        }
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
    init() {
      this.appendValueInput('VALUE');
      this.appendDummyInput().appendField('.').appendField(new Blockly.FieldTextInput('attr'), 'ATTR');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour('#a07a4a');
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
    init() {
      this.nargs_ = 0;
      this.kw_ = [];
      this.updateShape_();
      this.setOutput(true);
      this.setColour('#6a8a5b');
      this.setInputsInline(true);
    },
    saveExtraState() { return { nargs: this.nargs_, kw: this.kw_ }; },
    loadExtraState(state) {
      this.nargs_ = (state && typeof state.nargs === 'number') ? state.nargs : 0;
      this.kw_ = (state && Array.isArray(state.kw)) ? state.kw : [];
      this.updateShape_();
    },
    updateShape_() {
      if (this.getInput('FUNC')) this.removeInput('FUNC');
      let i = 0;
      while (this.getInput('ARG' + i)) { this.removeInput('ARG' + i); i++; }
      i = 0;
      while (this.getInput('KW' + i)) { this.removeInput('KW' + i); i++; }
      this.appendValueInput('FUNC');
      for (let t = 0; t < this.nargs_; t++) {
        this.appendValueInput('ARG' + t).appendField(t === 0 ? '(' : ',');
      }
      for (let t = 0; t < this.kw_.length; t++) {
        const name = this.kw_[t];
        const label = (name === null || name === undefined) ? '**' : name + '=';
        this.appendValueInput('KW' + t).appendField((t === 0 && this.nargs_ === 0) ? '(' + label : ',' + label);
      }
    },
  };
}

if (Blockly) {
  const stmt = (b, colour) => {
    b.setPreviousStatement(true, null);
    b.setNextStatement(true, null);
    b.setColour(colour);
  };
  Blockly.Blocks['ir_if'] = {
    init() {
      this.appendValueInput('TEST').appendField('if');
      this.appendStatementInput('BODY');
      this.appendStatementInput('ORELSE').appendField('else');
      stmt(this, '#a0734a');
    },
  };
  Blockly.Blocks['ir_while'] = {
    init() {
      this.appendValueInput('TEST').appendField('while');
      this.appendStatementInput('BODY');
      this.appendStatementInput('ORELSE').appendField('else');
      stmt(this, '#a0734a');
    },
  };
  Blockly.Blocks['ir_for'] = {
    init() {
      this.appendValueInput('TARGET').appendField('for');
      this.appendValueInput('ITER').appendField('in');
      this.appendStatementInput('BODY');
      this.appendStatementInput('ORELSE').appendField('else');
      stmt(this, '#a0734a');
    },
  };
  Blockly.Blocks['ir_pass'] = { init() { this.appendDummyInput().appendField('pass'); stmt(this, '#888888'); } };
  Blockly.Blocks['ir_break'] = { init() { this.appendDummyInput().appendField('break'); stmt(this, '#a0734a'); } };
  Blockly.Blocks['ir_continue'] = { init() { this.appendDummyInput().appendField('continue'); stmt(this, '#a0734a'); } };
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

  Blockly.Blocks['ir_funcdef'] = {
    params_: [], tparams_: [], ndec_: 0, ret_: false,
    init() {
      this.params_ = []; this.tparams_ = []; this.ndec_ = 0; this.ret_ = false;
      this.appendDummyInput('NAMEROW').appendField('def')
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
  };

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
  Blockly.Blocks['ir_nonlocal'] = {
    init() {
      this.appendDummyInput().appendField('nonlocal')
        .appendField(new Blockly.FieldTextInput('x'), 'NAMES');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#888888');
    },
  };
}

if (typeof module !== 'undefined') module.exports = {};
