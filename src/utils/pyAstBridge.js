/* pyAstBridge.js — CPython 3.12 ast (via Pyodide) <-> JSON IR. No hand-written parser.
 *
 * This is the foundation of the AST-IR redesign: Python text is parsed by the REAL
 * CPython ast.parse() running inside Pyodide and serialized to a canonical JSON IR
 * (node = { type: <ast.NodeName>, ...fields }). The inverse rebuilds ast nodes from
 * the IR and emits text via ast.unparse(). See DOCS/superpowers/specs/2026-06-07-*.
 *
 * SCOPE (Phase 1 walking skeleton): the round-trip guaranteed here is AST-level
 * (semantic) — python->IR->python reproduces the *program*, not its comments or exact
 * formatting. Comment preservation (Option 3) is Phase 3 and is layered on top later
 * via a parso CST; until then comment loss on this path is expected, not a defect.
 *
 * Non-JSON Constant values (bytes / complex / Ellipsis / inf / nan) are valid CPython
 * 3.12 constants but are not JSON-serializable. To keep Python->IR total (raw=0 for
 * Constant), they are tagged as { "__py__": ... } leaves and decoded on the way back.
 * A primitive is never a plain dict, and AST nodes always carry "type", so a "__py__"
 * dict is unambiguous.
 */

// Serialize an ast tree to a JSON-able IR dict. Primitives are JSON-encoded (with
// non-JSON constants tagged); lists map; AST nodes become { type, <fields...>, _loc? }.
const PY_AST_TO_JSON = `
import ast, json, base64
_SAFE_INT = 2**53 - 1  # JS Number.MAX_SAFE_INTEGER; ints beyond this lose precision in JSON.parse
def _enc_float(x):
    # inf / nan are not valid JSON tokens for the JS parser -> tag them
    if x != x or x in (float('inf'), float('-inf')):
        return {"__py__": "float", "repr": repr(x)}
    return x
def _enc_prim(v):
    if v is None or isinstance(v, bool) or isinstance(v, str):
        return v
    if isinstance(v, int):
        # large ints would be rounded by JS JSON.parse -> carry as a string
        return v if -_SAFE_INT <= v <= _SAFE_INT else {"__py__": "int", "s": str(v)}
    if isinstance(v, float):
        return _enc_float(v)
    if isinstance(v, bytes):
        return {"__py__": "bytes", "b64": base64.b64encode(v).decode('ascii')}
    if isinstance(v, complex):
        # real/imag may themselves be non-finite -> tag each through _enc_float
        return {"__py__": "complex", "real": _enc_float(v.real), "imag": _enc_float(v.imag)}
    if v is Ellipsis:
        return {"__py__": "ellipsis"}
    return v
# A field literally named "type" (only ExceptHandler in the closed 3.12 set) collides with
# the node-discriminator key, which is also "type". Remap such a field to "_field_type" in
# both directions so the discriminator and the field coexist losslessly.
def _key(f):
    return "_field_" + f if f == "type" else f
def _to_ir(node):
    if isinstance(node, ast.AST):
        d = {"type": type(node).__name__}
        for f in node._fields:
            d[_key(f)] = _to_ir(getattr(node, f, None))
        if hasattr(node, "lineno"):
            d["_loc"] = [node.lineno, getattr(node, "col_offset", 0)]
        return d
    if isinstance(node, list):
        return [_to_ir(x) for x in node]
    return _enc_prim(node)
def _parse(src):
    return json.dumps(_to_ir(ast.parse(src)))
`;

// Rebuild ast nodes from the IR and unparse back to Python source.
const PY_IR_TO_CODE = `
import ast, json, base64
def _dec_num(x):
    # a complex component may itself be a tagged non-finite float
    if isinstance(x, dict) and x.get("__py__") == "float":
        return float(x["repr"])
    return x
def _dec_prim(d):
    t = d["__py__"]
    if t == "int":     return int(d["s"])
    if t == "bytes":   return base64.b64decode(d["b64"])
    if t == "complex": return complex(_dec_num(d["real"]), _dec_num(d["imag"]))
    if t == "ellipsis": return Ellipsis
    if t == "float":   return float(d["repr"])  # 'inf' / '-inf' / 'nan'
    raise ValueError("unknown __py__ tag: " + str(t))
def _key(f):
    return "_field_" + f if f == "type" else f
def _from_ir(d):
    if isinstance(d, dict) and "type" in d:
        cls = getattr(ast, d["type"])
        kwargs = {f: _from_ir(d.get(_key(f))) for f in cls._fields}
        return ast.fix_missing_locations(cls(**kwargs))
    if isinstance(d, dict) and "__py__" in d:
        return _dec_prim(d)
    if isinstance(d, list):
        return [_from_ir(x) for x in d]
    return d
def _unparse(js):
    return ast.unparse(_from_ir(json.loads(js)))
`;

async function pythonToIR(pyodide, code) {
  pyodide.runPython(PY_AST_TO_JSON);
  // _parse is a PyProxy; release it after use so repeated sync doesn't leak WASM resources.
  const parse = pyodide.globals.get('_parse');
  try {
    return JSON.parse(parse(code));
  } finally {
    parse.destroy();
  }
}

async function irToPython(pyodide, ir) {
  pyodide.runPython(PY_IR_TO_CODE);
  const unparse = pyodide.globals.get('_unparse');
  try {
    return unparse(JSON.stringify(ir));
  } finally {
    unparse.destroy();
  }
}

// Resolve the live Pyodide instance for the conversion path. Prefer the readiness promise: it
// resolves only after FULL init (micropip + builtins), so awaiting it avoids racing a runPython
// against in-flight setup (window.__pyodide is set mid-init, before setup completes). Awaiting an
// already-resolved promise is immediate. Fall back to the live handle only when no promise exists
// (e.g. a runtime injected directly). Throws if Pyodide was never initialized.
async function getPyodide() {
  if (typeof window === 'undefined') throw new Error('getPyodide: no window');
  if (window.__pyodideReadyPromise) return window.__pyodideReadyPromise;
  if (window.__pyodide) return window.__pyodide;
  throw new Error('getPyodide: Pyodide not initialized (initPyodide/prewarmEnvironment must run first)');
}

const BlockPyAstBridge = { pythonToIR, irToPython, getPyodide, PY_AST_TO_JSON, PY_IR_TO_CODE };
if (typeof window !== 'undefined') window.BlockPyAstBridge = BlockPyAstBridge;
if (typeof module !== 'undefined') module.exports = BlockPyAstBridge;
