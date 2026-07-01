// LibrarySpec schema + pure validation (no Node/python deps — browser safe).
export const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const DOTTED = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
// VALUE_KINDS name a VALUE, not a call: a module constant (math.pi) or a class property (obj.device).
// They carry no call signature — block generators/mappers must SKIP them (they lower to an attribute
// reference, never a call), which is why validateSpec exempts them from the params/returns checks.
export const VALUE_KINDS = new Set(['constant', 'property']);
export const ENTRY_KINDS = new Set(['function', 'class', 'method', 'constant', 'property']);
export const PARAM_KINDS = new Set(['positional', 'keyword', 'vararg', 'kwarg']);

// Returns an error string, or null when the spec is well-formed.
export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') return 'spec must be an object';
  if (typeof spec.module !== 'string' || !DOTTED.test(spec.module)) return 'spec.module must be a dotted identifier';
  if (!Array.isArray(spec.entries)) return 'spec.entries must be an array';
  for (const e of spec.entries) {
    if (!e || !ENTRY_KINDS.has(e.kind)) return 'invalid entry kind: ' + (e && e.kind);
    if (typeof e.name !== 'string' || !IDENT.test(e.name)) return 'invalid entry name: ' + e.name;
    // method AND property are receiver-owned → both need a valid owner identifier.
    if ((e.kind === 'method' || e.kind === 'property') && (typeof e.owner !== 'string' || !IDENT.test(e.owner))) return e.kind + ' entry needs a valid owner: ' + e.name;
    if (VALUE_KINDS.has(e.kind)) continue;   // a value carries no params/returns to validate
    if (!Array.isArray(e.params)) return 'entry.params must be an array: ' + e.name;
    if (typeof e.returns !== 'boolean') return 'entry.returns must be a boolean: ' + e.name;
    const seen = new Set();
    for (const p of e.params) {
      if (!p || typeof p.name !== 'string' || !IDENT.test(p.name)) return 'invalid param name: ' + (p && p.name);
      if (!PARAM_KINDS.has(p.kind)) return 'invalid param kind: ' + p.kind;
      if (seen.has(p.name)) return 'duplicate param: ' + p.name;
      seen.add(p.name);
    }
  }
  return null;
}
