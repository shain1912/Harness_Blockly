import React, { useEffect, useState, useCallback } from 'react';

// VS Code-style file explorer over the real workspace folder on disk (server FS API at
// /api/fs/*). Clicking a file opens it (onOpenFile); New File / New Folder create inside the
// selected folder (or root); each row has a delete action. The workspace is the cwd for real
// Python, so files created here are exactly what cv2.imread()/open() see.
export default function FileExplorer({ activeFile, onOpenFile, onChanged, reloadToken }) {
  const [tree, setTree] = useState([]);
  const [root, setRoot] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedDir, setSelectedDir] = useState(''); // '' = workspace root
  const [creating, setCreating] = useState(null);      // 'file' | 'folder' | null
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/fs/tree');
      const j = await r.json();
      setTree(j.tree || []);
      setRoot(j.root || '');
    } catch (_) { /* backend not up yet */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh, reloadToken]);

  const toggle = (p) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });
  };

  const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) { setCreating(null); return; }
    const targetPath = joinPath(selectedDir, name);
    setBusy(true);
    try {
      if (creating === 'folder') {
        await fetch('/api/fs/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: targetPath }) });
        setExpanded((prev) => new Set(prev).add(selectedDir).add(targetPath));
      } else {
        await fetch('/api/fs/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: targetPath, content: '' }) });
        await refresh();
        onOpenFile && onOpenFile(targetPath);
      }
    } finally {
      setBusy(false);
      setCreating(null);
      setNewName('');
      refresh();
      onChanged && onChanged();
    }
  };

  const del = async (node, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${node.name}"?${node.type === 'dir' ? ' (folder and everything inside)' : ''}`)) return;
    setBusy(true);
    try {
      await fetch('/api/fs/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: node.path }) });
    } finally {
      setBusy(false);
      refresh();
      onChanged && onChanged();
    }
  };

  const iconFor = (node) => {
    if (node.type === 'dir') return expanded.has(node.path) ? 'fa-folder-open' : 'fa-folder';
    if (node.kind === 'image') return 'fa-image';
    if (node.ext === '.py') return 'fa-brands fa-python';
    return 'fa-file-lines';
  };

  const renderNodes = (nodes, depth) => nodes.map((node) => {
    const isActive = node.type === 'file' && node.path === activeFile;
    const isSelDir = node.type === 'dir' && node.path === selectedDir;
    const pad = 6 + depth * 14;
    return (
      <div key={node.path}>
        <div
          className={`fx-row${isActive ? ' fx-active' : ''}${isSelDir ? ' fx-seldir' : ''}`}
          style={{ paddingLeft: pad }}
          onClick={() => {
            if (node.type === 'dir') { toggle(node.path); setSelectedDir(node.path); }
            else { onOpenFile && onOpenFile(node.path); }
          }}
          title={node.path}
        >
          {node.type === 'dir' && (
            <i className={`fa-solid fa-chevron-${expanded.has(node.path) ? 'down' : 'right'} fx-caret`}></i>
          )}
          <i className={`${node.ext === '.py' ? '' : 'fa-solid '}${iconFor(node)} fx-icon`}></i>
          <span className="fx-name">{node.name}</span>
          <button className="fx-del" title="Delete" onClick={(e) => del(node, e)}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        {node.type === 'dir' && expanded.has(node.path) && node.children && node.children.length > 0 && (
          renderNodes(node.children, depth + 1)
        )}
      </div>
    );
  });

  return (
    <div className="fx-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-solid fa-folder-tree icon-cyan"></i>
          <h3>Files</h3>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" title="New File" disabled={busy}
            onClick={() => { setCreating('file'); setNewName(''); }}>
            <i className="fa-solid fa-file-circle-plus"></i>
          </button>
          <button className="btn btn-secondary btn-sm" title="New Folder" disabled={busy}
            onClick={() => { setCreating('folder'); setNewName(''); }}>
            <i className="fa-solid fa-folder-plus"></i>
          </button>
          <button className="btn btn-secondary btn-sm" title="Refresh" onClick={refresh}>
            <i className="fa-solid fa-rotate"></i>
          </button>
        </div>
      </div>

      <div className="fx-target" title="New files/folders are created here">
        <i className="fa-solid fa-location-dot"></i>{' '}
        {selectedDir ? selectedDir + '/' : '(workspace root)'}
        {selectedDir && (
          <button className="fx-up" title="Up to root" onClick={() => setSelectedDir('')}>
            <i className="fa-solid fa-arrow-up-from-bracket"></i>
          </button>
        )}
      </div>

      {creating && (
        <div className="fx-create">
          <i className={`fa-solid ${creating === 'folder' ? 'fa-folder-plus' : 'fa-file-circle-plus'}`}></i>
          <input
            autoFocus
            className="fx-input"
            placeholder={creating === 'folder' ? 'folder name' : 'file name (e.g. script.py)'}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') { setCreating(null); setNewName(''); } }}
          />
          <button className="btn btn-primary btn-xs" onClick={submitCreate} disabled={busy}>Add</button>
          <button className="btn btn-secondary btn-xs" onClick={() => { setCreating(null); setNewName(''); }}>✕</button>
        </div>
      )}

      <div className="fx-tree">
        {tree.length === 0 ? (
          <div className="fx-empty">No files yet. Use <b>New File</b> to start.</div>
        ) : renderNodes(tree, 0)}
      </div>

      {root && <div className="fx-root" title={root}>{root}</div>}
    </div>
  );
}
