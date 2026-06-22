// Build a Blockly Python generator for one spec entry. Pure (no Blockly import; uses the
// generator instance passed at call time). Methods: ARG0.. are real args, the receiver is RECV.
export function makeGenerator(moduleName, entry) {
  return function (block, gen) {
    const ORDER_ATOMIC = gen.ORDER_ATOMIC ?? 0;
    const ORDER_NONE = gen.ORDER_NONE ?? 99;
    const parts = [];
    (entry.params || []).forEach((p, i) => {
      const code = gen.valueToCode(block, 'ARG' + i, ORDER_NONE);
      const empty = code === '' || code == null;
      // *args / **kwargs keep their unpacking prefix and are always optional (omit when empty).
      if (p.kind === 'vararg') { if (!empty) parts.push('*' + code); return; }
      if (p.kind === 'kwarg') { if (!empty) parts.push('**' + code); return; }
      // keyword-only: name=value; if required and empty, still keyword (name=None) so it never
      // becomes a trailing positional after earlier keyword args (invalid Python).
      if (p.kind === 'keyword') {
        if (!empty) parts.push(`${p.name}=${code}`);
        else if (!p.hasDefault) parts.push(`${p.name}=None`);
        return;
      }
      // positional: value, or None when required+empty; optional+empty -> omit (default applies).
      if (!empty) parts.push(code);
      else if (!p.hasDefault) parts.push('None');
    });
    const argList = parts.join(', ');
    let callee;
    if (entry.kind === 'method') {
      const recv = gen.valueToCode(block, 'RECV', ORDER_ATOMIC) || '_obj';
      callee = `${recv}.${entry.name}`;
    } else {
      callee = `${moduleName}.${entry.name}`;   // function or class constructor
    }
    const code = `${callee}(${argList})`;
    return entry.returns ? [code, ORDER_ATOMIC] : code + '\n';
  };
}
