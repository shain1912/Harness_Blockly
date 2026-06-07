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

if (typeof module !== 'undefined') module.exports = {};
