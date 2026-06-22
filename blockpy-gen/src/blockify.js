import { introspectModule } from './introspect/introspect.js';
import { defineBlocks } from './blocks/define.js';
import { buildToolbox } from './blocks/toolbox.js';

// Node/Electron one-call: introspect a module, define its blocks on the injected Blockly, build
// (and optionally apply) the toolbox.
export async function blockify(Blockly, name, opts = {}) {
  const spec = await introspectModule(name, opts);
  const { types } = defineBlocks(Blockly, spec, opts);
  const toolbox = buildToolbox(spec, opts);
  if (opts.workspace && typeof opts.workspace.updateToolbox === 'function') opts.workspace.updateToolbox(toolbox);
  return { spec, types, toolbox };
}
