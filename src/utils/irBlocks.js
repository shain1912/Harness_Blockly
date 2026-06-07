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

if (typeof module !== 'undefined') module.exports = {};
