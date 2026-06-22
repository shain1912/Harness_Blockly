import { blockType } from './naming.js';

// LibrarySpec -> Blockly categoryToolbox JSON. Pure.
export function buildToolbox(spec, opts = {}) {
  const ref = (e) => ({ kind: 'block', type: blockType(spec.module, e) });
  const cat = (name, entries) => ({ kind: 'category', name, contents: entries.map(ref) });
  const fns = spec.entries.filter((e) => e.kind === 'function');
  const classes = spec.entries.filter((e) => e.kind === 'class');
  const methodsByOwner = new Map();
  for (const e of spec.entries) if (e.kind === 'method') {
    if (!methodsByOwner.has(e.owner)) methodsByOwner.set(e.owner, []);
    methodsByOwner.get(e.owner).push(e);
  }
  const contents = [];
  if (fns.length) contents.push(cat(`${spec.module} functions`, fns));
  for (const c of classes) contents.push(cat(c.name, [c, ...(methodsByOwner.get(c.name) || [])]));
  for (const [owner, ms] of methodsByOwner) if (!classes.some((c) => c.name === owner)) contents.push(cat(owner, ms));
  return { kind: 'categoryToolbox', contents };
}
