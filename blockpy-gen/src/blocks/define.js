import { validateSpec, VALUE_KINDS } from '../spec.js';
import { blockType } from './naming.js';
import { makeGenerator } from './codegen.js';

// Register Blockly block defs + Python generators for every entry. Blockly is INJECTED.
export function defineBlocks(Blockly, spec, opts = {}) {
  const err = validateSpec(spec);
  if (err) throw new Error('blockpy-gen: invalid spec — ' + err);
  const colour = opts.colour ?? 230;
  const types = [];
  for (const entry of spec.entries) {
    if (VALUE_KINDS.has(entry.kind)) continue;   // constants/properties are attribute VALUES, not call blocks (no generator)
    const type = blockType(spec.module, entry);
    if (Blockly && Blockly.Blocks && !Blockly.Blocks[type]) {
      Blockly.Blocks[type] = { init: makeInit(spec.module, entry, colour) };
    }
    const py = Blockly && Blockly.Python;
    if (py) {
      const g = makeGenerator(spec.module, entry);
      if (py.forBlock) py.forBlock[type] = g; else py[type] = g;
    }
    types.push(type);
  }
  return { types };
}

function makeInit(moduleName, entry, colour) {
  return function () {
    const title = entry.kind === 'method' ? `${entry.owner}.${entry.name}` : `${moduleName}.${entry.name}`;
    this.appendDummyInput().appendField(title);
    if (entry.kind === 'method') this.appendValueInput('RECV').appendField('of');
    (entry.params || []).forEach((p, i) => {
      this.appendValueInput('ARG' + i).appendField(p.name + (p.hasDefault ? '?' : ''));
    });
    if (entry.returns) this.setOutput(true, null);
    else { this.setPreviousStatement(true, null); this.setNextStatement(true, null); }
    this.setColour(colour);
    this.setTooltip(((entry.doc || '').split('\n')[0] || '').slice(0, 200));
  };
}
