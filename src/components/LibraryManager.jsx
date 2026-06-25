import React, { useState, useMemo } from 'react';

export default function LibraryManager({
  onAbstract,
  onBlockify,
  onRemoveLibrary,
  onClearLibraries,
  installedBlocks,
  aiThoughts,
  isAbstracting,
  pipPkg = '',
  onPipPkgChange,
  onPipInstallShell,
}) {
  // One row per toolbox tab (source library), recomputed whenever the registry changes
  // (installedBlocks is the reactive trigger). Built-in preset tabs are not deletable.
  const libraries = useMemo(() => {
    const reg = typeof window !== 'undefined' ? window.BlockPyLibRegistry : null;
    return reg && reg.listLibraries ? reg.listLibraries() : [];
  }, [installedBlocks]);
  const userLibCount = libraries.filter((l) => !l.builtin).length;
  const [selectedLib, setSelectedLib] = useState('cv2');
  const [customPrompt, setCustomPrompt] = useState('import tensorflow as tf\nmodel = tf.keras.Sequential()\nmodel.compile(optimizer="adam")\nmodel.fit(x, y)');
  const [blockifyMod, setBlockifyMod] = useState('PIL.Image');
  const [blockifyPurpose, setBlockifyPurpose] = useState('');

  const handleAbstractClick = () => {
    onAbstract(selectedLib, selectedLib === 'custom' ? customPrompt : '');
  };

  const handleBlockifyClick = () => {
    if (onBlockify && blockifyMod.trim()) onBlockify(blockifyMod.trim(), blockifyPurpose.trim());
  };

  return (
    <div className="library-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-solid fa-cube icon-cyan"></i>
          <h3>AI Library Abstraction</h3>
        </div>
        <span id="dynamic-blocks-count" className="badge badge-system">
          {installedBlocks.length} Blocks
        </span>
      </div>

      <div className="library-body">

        {/* ── Installed libraries (toolbox tabs) + delete ──── */}
        <div className="form-group">
          <div className="lib-manage-head">
            <label style={{ margin: 0 }}>Libraries — toolbox tabs</label>
            {userLibCount > 0 && (
              <button className="btn btn-secondary btn-xs" onClick={onClearLibraries} title="Remove all added libraries and their toolbox tabs">
                <i className="fa-solid fa-trash-can"></i> Clear all
              </button>
            )}
          </div>
          <div className="lib-list">
            {libraries.length === 0 ? (
              <div className="empty-list-placeholder">No libraries added yet. Blockify one below.</div>
            ) : libraries.map((l) => (
              <div key={l.lib} className="lib-row" title={l.lib}>
                <span className="lib-row-name"><i className="fa-solid fa-layer-group"></i> {l.lib}</span>
                <span className="lib-row-count">
                  {l.blockCount} block{l.blockCount !== 1 ? 's' : ''}{l.macroCount ? ` · ${l.macroCount} macro${l.macroCount !== 1 ? 's' : ''}` : ''}
                </span>
                {l.builtin ? (
                  <span className="lib-row-builtin" title="Built-in preset — comes back on reload">built-in</span>
                ) : (
                  <button className="lib-row-del" title={`Remove "${l.lib}" and its toolbox tab`} onClick={() => onRemoveLibrary(l.lib)}>
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── pip install (real local shell pip) ───────────── */}
        <div className="form-group">
          <label htmlFor="pip-pkg-input">pip install — install a library</label>
          <form
            className="pip-form"
            onSubmit={(e) => { e.preventDefault(); onPipInstallShell && onPipInstallShell(); }}
          >
            <span className="pip-label">pip install</span>
            <input
              id="pip-pkg-input"
              className="pip-input"
              type="text"
              value={pipPkg}
              onChange={(e) => onPipPkgChange && onPipPkgChange(e.target.value)}
              placeholder="e.g. pillow, numpy, mediapipe ..."
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!pipPkg.trim()}>Install</button>
          </form>
        </div>

        {/* ── Blockify (introspection — no AI cost) ───────── */}
        <div className="form-group">
          <label htmlFor="blockify-mod-input">Blockify a library — module name → real-API blocks</label>
          <form
            className="pip-form"
            onSubmit={(e) => { e.preventDefault(); handleBlockifyClick(); }}
          >
            <input
              id="blockify-mod-input"
              className="pip-input"
              type="text"
              value={blockifyMod}
              onChange={(e) => setBlockifyMod(e.target.value)}
              placeholder="e.g. PIL.Image, numpy, requests ..."
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={isAbstracting || !blockifyMod.trim()}>
              {isAbstracting ? <i className="fa-solid fa-gear fa-spin"></i> : <i className="fa-solid fa-cubes"></i>} {blockifyPurpose.trim() ? 'Curate' : 'Blockify'}
            </button>
          </form>
          <input
            id="blockify-purpose-input"
            className="pip-input"
            type="text"
            value={blockifyPurpose}
            onChange={(e) => setBlockifyPurpose(e.target.value)}
            placeholder="Purpose (optional) — e.g. 초보자용 이미지 편집: 열기·크기변경·흑백·저장"
            style={{ width: '100%', marginTop: 6 }}
          />
          <small className="form-hint">Imports the module in real Python for exact-signature blocks; the matching <code>import</code> block is added automatically. Add a <b>purpose</b> and the AI curates a small, labelled subset for that goal.</small>
        </div>

        {/* ── AI Block Abstraction ────────────────────────── */}
        <div className="form-group">
          <label htmlFor="abstract-lib-select">AI Block Generator — Select Library</label>
          <select
            id="abstract-lib-select"
            value={selectedLib}
            onChange={(e) => setSelectedLib(e.target.value)}
          >
            <option value="cv2">OpenCV (cv2) - Presets</option>
            <option value="requests">requests (HTTP) - Presets</option>
            <option value="matplotlib">matplotlib (plt) - Presets</option>
            <option value="pandas">pandas (pd) - Presets</option>
            <option value="math">math (Trig & Roots) - Presets</option>
            <option value="custom">-- Custom Library --</option>
          </select>
        </div>

        {selectedLib === 'custom' && (
          <div className="form-group" id="custom-prompt-wrapper">
            <label htmlFor="custom-lib-prompt">Sample usage code</label>
            <textarea
              id="custom-lib-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. import tensorflow as tf..."
            />
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          id="btn-generate-blocks"
          onClick={handleAbstractClick}
          disabled={isAbstracting}
        >
          {isAbstracting
            ? <><i className="fa-solid fa-gear fa-spin"></i> Abstracting...</>
            : <><i className="fa-solid fa-wand-magic-sparkles"></i> Generate Blocks with AI</>}
        </button>

        {/* AI thoughts */}
        <div className="ai-agent-panel">
          <div className="ai-panel-title">
            <i className="fa-solid fa-robot"></i> AI Reasoning
          </div>
          <div id="ai-chat-sim" className="ai-chat-body">
            {aiThoughts.length === 0
              ? <div className="thoughts-placeholder">AI ready. Choose a library and click Generate.</div>
              : aiThoughts.map((t, i) => (
                  <div key={i} className="ai-chat-bubble ai">
                    <strong>AI:</strong> {t}
                  </div>
                ))}
          </div>
        </div>

        {/* Installed blocks */}
        <div className="dynamic-blocks-panel">
          <div className="ai-panel-title">
            <i className="fa-solid fa-puzzle-piece"></i> Registered Visual Blocks
          </div>
          <div id="dynamic-blocks-list" className="dyn-blocks-body">
            {installedBlocks.length === 0
              ? <div className="empty-list-placeholder">No custom blocks yet.</div>
              : installedBlocks.map((b, i) => (
                  <div key={i} className="dyn-block-pill">
                    <span className="dyn-block-name">{b.title}</span>
                    <span className="dyn-block-type">{b.hasOutput ? 'Output' : 'Statement'}</span>
                  </div>
                ))}
          </div>
        </div>

      </div>
    </div>
  );
}
