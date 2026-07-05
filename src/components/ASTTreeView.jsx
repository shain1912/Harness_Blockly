import React, { useState, useEffect, useRef } from 'react';

// AST Explorer — renders the AUTHORITATIVE CPython 3.12 AST (the same tree the converter uses),
// via BlockPyAstBridge.pythonToIR (ast.parse in Pyodide). Previously this used the retired
// hand-written parser (window.BlockPyParser), which is weaker than CPython and so flagged valid
// Python as a parse error — misleading, since the app converts that code fine. A generic renderer
// walks any node (an object with a `type` field) instead of a per-node-type switch, so it stays
// correct as the language grows.

const isNode = (v) => v && typeof v === 'object' && typeof v.type === 'string';
// Cosmetic noise on every node — hide from the explorer (they don't help read the tree):
// _loc (source position), ctx (Load/Store, fixed by position), type_comment/type_ignores, _comments.
const HIDE = new Set(['type', '_loc', 'ctx', 'type_comment', 'type_ignores', '_comments']);

// Inline scalar fields (id, op, value, name, …) — everything on a node that isn't a child node.
function scalarDetails(node) {
  const parts = [];
  for (const [k, v] of Object.entries(node)) {
    if (HIDE.has(k)) continue;
    if (isNode(v)) continue;
    if (Array.isArray(v)) {
      if (v.length && !v.some(isNode)) parts.push(`${k}=${JSON.stringify(v)}`);
      continue;
    }
    if (v === null || typeof v !== 'object') parts.push(`${k}=${typeof v === 'string' ? JSON.stringify(v) : String(v)}`);
    else if (v && v.__py__) parts.push(`${k}=${v.repr != null ? v.repr : JSON.stringify(v)}`);   // tagged constant (bytes/complex/float)
  }
  return parts.join('  ');
}

// Child nodes: a field that is a node, or an array containing nodes (flattened with an index label).
function childEntries(node) {
  const out = [];
  for (const [k, v] of Object.entries(node)) {
    if (HIDE.has(k)) continue;
    if (isNode(v)) out.push({ label: k, node: v });
    else if (Array.isArray(v) && v.some(isNode)) v.forEach((c, i) => { if (isNode(c)) out.push({ label: `${k}[${i}]`, node: c }); });
  }
  return out;
}

function ASTNodeView({ node, label, depth = 0 }) {
  const [isOpen, setIsOpen] = useState(depth < 3);
  if (!isNode(node)) return null;
  const kids = childEntries(node);
  const details = scalarDetails(node);
  return (
    <div className="ast-node">
      <div className="ast-node-header">
        <span
          className="ast-toggle"
          onClick={(e) => { e.stopPropagation(); if (kids.length) setIsOpen(!isOpen); }}
        >
          {kids.length ? (
            isOpen ? <i className="fa-solid fa-chevron-down"></i> : <i className="fa-solid fa-chevron-right"></i>
          ) : (
            <i className="fa-solid fa-circle-notch" style={{ fontSize: '0.5rem', opacity: 0.3 }}></i>
          )}
        </span>
        {label && <span className="ast-prop">{label}: </span>}
        <span className="ast-type">{node.type}</span>
        {details && <span className="ast-details">{details}</span>}
      </div>
      {kids.length > 0 && isOpen && (
        <div className="ast-node-children">
          {kids.map((c, i) => <ASTNodeView key={i} node={c.node} label={c.label} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export default function ASTTreeView({ code }) {
  const [ir, setIr] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  useEffect(() => {
    const src = code || '';
    if (!src.trim() || src.startsWith('# Start dragging')) { setIr(null); setError(null); return; }
    const my = ++genRef.current;
    setLoading(true);
    (async () => {
      try {
        const py = await window.BlockPyAstBridge.getPyodide();
        const tree = await window.BlockPyAstBridge.pythonToIR(py, src);
        if (my !== genRef.current) return;
        setIr(tree);
        setError(null);
      } catch (err) {
        if (my !== genRef.current) return;
        setError((err && err.message) || String(err));
        setIr(null);
      } finally {
        if (my === genRef.current) setLoading(false);
      }
    })();
  }, [code]);

  return (
    <div className="ast-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-solid fa-network-wired icon-cyan"></i>
          <h3>Interactive AST Explorer</h3>
        </div>
      </div>
      <div id="ast-tree-view" className="ast-body">
        {error ? (
          <div className="tree-placeholder error">AST Parsing error: {error}</div>
        ) : ir ? (
          <ASTNodeView node={ir} depth={0} />
        ) : (
          <div className="tree-placeholder">{loading ? 'Parsing (CPython AST)…' : 'Write Python to see its CPython AST.'}</div>
        )}
      </div>
    </div>
  );
}
