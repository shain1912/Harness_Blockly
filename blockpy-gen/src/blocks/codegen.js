// Build a Blockly Python generator for one spec entry. Pure (no Blockly import; uses the
// generator instance passed at call time). Methods: ARG0.. are real args, the receiver is RECV.
export function makeGenerator(moduleName, entry) {
  return function (block, gen) {
    const ORDER_ATOMIC = gen.ORDER_ATOMIC ?? 0;
    const ORDER_NONE = gen.ORDER_NONE ?? 99;
    const parts = [];
    (entry.params || []).forEach((p, i) => {
      const code = gen.valueToCode(block, 'ARG' + i, ORDER_NONE);
      if (code === '' || code == null) {
        if (p.hasDefault) return;          // optional + empty -> omit (Python default applies)
        parts.push('None');                // required + empty -> explicit None placeholder
        return;
      }
      parts.push(p.kind === 'keyword' ? `${p.name}=${code}` : code);
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
