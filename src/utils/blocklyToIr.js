/* blocklyToIr.js — pure JS: Blockly workspace JSON -> canonical AST-IR.
 *
 * Inverse of irToBlockly.js. Produces a normalized ast-IR that pyAstBridge.irToPython
 * rebuilds and unparses. Intentionally NOT carried (ast.unparse, our only consumer,
 * ignores them; they are recomputable or irrelevant to emitted text):
 *   - Name/expr `ctx` (Load/Store/Del) — fully determined by position (target vs value)
 *   - `_loc`, Constant `kind`, `type_comment` — formatting/locations, not semantics
 * Comment preservation (Option 3) is layered later via parso (Phase 3), not here.
 */

// block -> a collection of element expressions (List/Tuple/Set).
function eltsToExpr(astType) {
  return (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const elts = [];
    for (let i = 0; i < n; i++) elts.push(blockToExpr(b.inputs['ELT' + i].block));
    return { type: astType, elts };
  };
}

const BLOCK_TO_EXPR = {
  ir_name:  (b) => ({ type: 'Name', id: b.fields.ID }),
  ir_const: (b) => ({ type: 'Constant', value: JSON.parse(b.fields.VALUE) }),
  ir_list:  eltsToExpr('List'),
  ir_tuple: eltsToExpr('Tuple'),
  ir_set:   eltsToExpr('Set'),
  ir_dict: (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const keys = [];
    const values = [];
    for (let i = 0; i < n; i++) {
      // a missing KEYi means a null key (** unpacking)
      keys.push(b.inputs['KEY' + i] ? blockToExpr(b.inputs['KEY' + i].block) : null);
      values.push(blockToExpr(b.inputs['VAL' + i].block));
    }
    return { type: 'Dict', keys, values };
  },
  // Operators: the OP field carries the enum node's type name; rebuild it as a bare node.
  ir_binop: (b) => ({ type: 'BinOp', left: blockToExpr(b.inputs.LEFT.block),
    op: { type: b.fields.OP }, right: blockToExpr(b.inputs.RIGHT.block) }),
  ir_unaryop: (b) => ({ type: 'UnaryOp', op: { type: b.fields.OP },
    operand: blockToExpr(b.inputs.OPERAND.block) }),
  ir_boolop: (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const values = [];
    for (let i = 0; i < n; i++) values.push(blockToExpr(b.inputs['VAL' + i].block));
    return { type: 'BoolOp', op: { type: b.fields.OP }, values };
  },
  ir_compare: (b) => {
    const n = (b.extraState && b.extraState.n) || 0;
    const ops = [];
    const comparators = [];
    for (let i = 0; i < n; i++) {
      ops.push({ type: b.fields['OP' + i] });
      comparators.push(blockToExpr(b.inputs['CMP' + i].block));
    }
    return { type: 'Compare', left: blockToExpr(b.inputs.LEFT.block), ops, comparators };
  },
  ir_attribute: (b) => ({ type: 'Attribute', value: blockToExpr(b.inputs.VALUE.block), attr: b.fields.ATTR }),
  ir_subscript: (b) => ({ type: 'Subscript', value: blockToExpr(b.inputs.VALUE.block),
    slice: blockToExpr(b.inputs.SLICE.block) }),
  ir_slice: (b) => ({ type: 'Slice',
    lower: b.inputs.LOWER ? blockToExpr(b.inputs.LOWER.block) : null,
    upper: b.inputs.UPPER ? blockToExpr(b.inputs.UPPER.block) : null,
    step: b.inputs.STEP ? blockToExpr(b.inputs.STEP.block) : null }),
  ir_starred: (b) => ({ type: 'Starred', value: blockToExpr(b.inputs.VALUE.block) }),
};

const BLOCK_TO_STMT = {
  ir_assign: (b) => {
    const n = (b.extraState && b.extraState.n) || 1;  // arity carried in extraState
    const targets = [];
    for (let i = 0; i < n; i++) targets.push(blockToExpr(b.inputs['TARGET' + i].block));
    return { type: 'Assign', targets, value: blockToExpr(b.inputs.VALUE.block) };
  },
  ir_augassign: (b) => ({ type: 'AugAssign', target: blockToExpr(b.inputs.TARGET.block),
    op: { type: b.fields.OP }, value: blockToExpr(b.inputs.VALUE.block) }),
  ir_annassign: (b) => ({ type: 'AnnAssign',
    target: blockToExpr(b.inputs.TARGET.block),
    annotation: blockToExpr(b.inputs.ANNOTATION.block),
    value: b.inputs.VALUE ? blockToExpr(b.inputs.VALUE.block) : null,   // optional
    simple: (b.extraState && typeof b.extraState.simple === 'number') ? b.extraState.simple : 1 }),
};

// Blockly omits `inputs` entirely when a block has no connected inputs (e.g. an empty
// slice a[:] -> ir_slice with no LOWER/UPPER/STEP). Normalize so handlers can always read
// b.inputs.X safely (absent -> undefined, handled by their optional guards).
function blockToExpr(b) {
  if (!b.inputs) b.inputs = {};
  const h = BLOCK_TO_EXPR[b.type];
  if (!h) throw new Error('blocklyToIr: no expr handler for ' + b.type);
  return h(b);
}

function blockToStmt(b) {
  if (!b.inputs) b.inputs = {};
  const h = BLOCK_TO_STMT[b.type];
  if (!h) throw new Error('blocklyToIr: no stmt handler for ' + b.type);
  return h(b);
}

function blocklyToIr(ws) {
  const body = [];
  // A workspace may hold multiple disconnected top-level stacks; Blockly serializes each
  // as an entry in blocks.blocks. Convert every stack (then its next-chain) so none are
  // dropped — starting only at blocks[0] would silently lose the rest.
  const tops = (ws && ws.blocks && ws.blocks.blocks) || [];
  for (const top of tops) {
    let cur = top;
    while (cur) {
      body.push(blockToStmt(cur));
      cur = cur.next && cur.next.block;
    }
  }
  // type_ignores is a sequence field ast.unparse iterates over; it must be [] not None.
  // Each node handler likewise emits the structural list fields its ast node requires.
  return { type: 'Module', body, type_ignores: [] };
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIR = Object.assign(api.BlockPyIR || {}, { blocklyToIr, blockToExpr });
if (typeof module !== 'undefined') module.exports = api.BlockPyIR;
