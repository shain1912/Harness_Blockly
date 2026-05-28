import React, { useState } from 'react';

export default function LibraryManager({
  onAbstract,
  onPipInstall,
  installedBlocks,
  aiThoughts,
  isAbstracting,
  pyodideReady,
  pyodideLoading,
}) {
  const [selectedLib, setSelectedLib] = useState('cv2');
  const [customPrompt, setCustomPrompt] = useState('import tensorflow as tf\nmodel = tf.keras.Sequential()\nmodel.compile(optimizer="adam")\nmodel.fit(x, y)');
  const [pipInput, setPipInput] = useState('');
  const [pipBusy, setPipBusy] = useState(false);

  const handleAbstractClick = () => {
    onAbstract(selectedLib, selectedLib === 'custom' ? customPrompt : '');
  };

  const handlePipSubmit = async (e) => {
    e.preventDefault();
    if (!pipInput.trim()) return;
    setPipBusy(true);
    await onPipInstall(pipInput.trim());
    setPipInput('');
    setPipBusy(false);
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

        {/* ── Pyodide pip install ─────────────────────────── */}
        <div className="pip-panel">
          <div className="ai-panel-title">
            <i className="fa-brands fa-python"></i> pip install
            {pyodideLoading && <span className="pip-status loading"> (loading Python...)</span>}
            {pyodideReady && !pyodideLoading && <span className="pip-status ready"> ✅ ready</span>}
          </div>
          <form className="pip-form" onSubmit={handlePipSubmit}>
            <input
              className="pip-input"
              type="text"
              value={pipInput}
              onChange={(e) => setPipInput(e.target.value)}
              placeholder="e.g. numpy, requests, pygame..."
              disabled={pipBusy}
            />
            <button
              type="submit"
              className="btn btn-teal btn-sm"
              disabled={pipBusy || !pipInput.trim()}
            >
              {pipBusy ? <><i className="fa-solid fa-gear fa-spin"></i> Installing...</> : 'Install'}
            </button>
          </form>
          <div className="pip-note">
            Pure Python packages install via micropip. Packages with C extensions
            must be in Pyodide's built-in list (numpy, pandas, matplotlib, PIL…).
            pygame is not yet supported in browser WebAssembly.
          </div>
        </div>

        <div className="divider" />

        {/* ── AI Block Abstraction ────────────────────────── */}
        <div className="form-group">
          <label htmlFor="lib-selector">AI Block Generator — Select Library</label>
          <select
            id="lib-selector"
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
          id="btn-abstract-library"
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
