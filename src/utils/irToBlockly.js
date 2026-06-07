/* irToBlockly.js — pure JS: canonical AST-IR -> Blockly workspace JSON.
 *
 * The IR is the CPython-3.12 ast shape (see pyAstBridge.js). This module maps each IR
 * node to a Blockly block, one direction of the single-IR round-trip. blocklyToIr.js is
 * the inverse; the two share the block-type/field schema so parity is structural.
 *
 * Handlers are kept as maps (not a switch) so HANDLED auto-tracks which ast node types
 * have a block — the raw=0 coverage test reads BlockPyIR.__handled.
 */

// Policy per ast node (closed CPython-3.12 set is filled in over the worklist; see spec §5).
const NODE_POLICY = {
  Module: 'ROOT', Assign: 'DB', Name: 'DB', Constant: 'DB',
};

function blk(type, fields = {}, inputs = {}) {
  return { type, fields, inputs };
}

// expr IR -> block
const EXPR_HANDLERS = {
  Name:     (n) => blk('ir_name',  { ID: n.id }),
  Constant: (n) => blk('ir_const', { VALUE: JSON.stringify(n.value) }),
};

// stmt IR -> block
const STMT_HANDLERS = {
  // targets is a list (a = b = 1 has two) of *expressions* in Store context
  // (Name/Attribute/Subscript/Tuple/...). Model each as its own block input so the
  // mapping is lossless for every target form whose expr handler exists; unimplemented
  // target expr types defer (throw) rather than being silently dropped/corrupted.
  Assign: (n) => {
    const inputs = {};
    n.targets.forEach((t, i) => { inputs['TARGET' + i] = { block: exprToBlock(t) }; });
    inputs.VALUE = { block: exprToBlock(n.value) };
    // Variable arity -> extraState (not a field) so a REAL Blockly load rebuilds the
    // matching TARGET* inputs via loadExtraState before connections are restored.
    return { type: 'ir_assign', extraState: { n: n.targets.length }, inputs };
  },
};

function exprToBlock(n) {
  const h = EXPR_HANDLERS[n.type];
  if (!h) throw new Error('irToBlockly: no expr handler for ' + n.type);
  return h(n);
}

function stmtToBlock(n) {
  const h = STMT_HANDLERS[n.type];
  if (!h) throw new Error('irToBlockly: no stmt handler for ' + n.type);
  return h(n);
}

function irToBlockly(ir) {
  if (!ir || ir.type !== 'Module') throw new Error('irToBlockly: root must be Module');
  const top = ir.body.map(stmtToBlock);
  for (let i = 0; i < top.length - 1; i++) top[i].next = { block: top[i + 1] };
  return { blocks: { languageVersion: 0, blocks: top.length ? [top[0]] : [] } };
}

// AST node types this module can turn into blocks (for the raw=0 coverage gate).
const __handled = new Set([...Object.keys(EXPR_HANDLERS), ...Object.keys(STMT_HANDLERS)]);

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIR = Object.assign(api.BlockPyIR || {}, { irToBlockly, exprToBlock, NODE_POLICY, __handled });
if (typeof module !== 'undefined') module.exports = api.BlockPyIR;
