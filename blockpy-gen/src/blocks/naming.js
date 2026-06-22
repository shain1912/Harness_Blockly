// Deterministic, collision-safe Blockly block type for a spec entry. Pure.
const sanitize = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
export function blockType(moduleName, entry) {
  const mod = sanitize(moduleName);
  if (entry.kind === 'function') return `lib_${mod}__${entry.name}`;
  if (entry.kind === 'class') return `lib_${mod}__${entry.name}__new`;
  return `lib_${mod}__${entry.owner}__${entry.name}__m`;
}
