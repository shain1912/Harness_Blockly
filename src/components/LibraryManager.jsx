import React, { useState, useMemo, useEffect } from 'react';

export default function LibraryManager({
  onBlockify,
  onCurate,
  onRemoveLibrary,
  onClearLibraries,
  installedBlocks,
  aiThoughts,
  isAbstracting,
  pipPkg = '',
  onPipPkgChange,
  onPipInstallShell,
}) {
  // One row per toolbox tab (source library OR a curated view), recomputed whenever the registry
  // changes (installedBlocks is the reactive trigger). Built-in preset tabs are not deletable.
  const libraries = useMemo(() => {
    const reg = typeof window !== 'undefined' ? window.BlockPyLibRegistry : null;
    return reg && reg.listLibraries ? reg.listLibraries() : [];
  }, [installedBlocks]);
  const userLibCount = libraries.filter((l) => !l.builtin).length;

  const [blockifyMod, setBlockifyMod] = useState('pydobot');
  const [curateMod, setCurateMod] = useState('');
  const [curatePurpose, setCuratePurpose] = useState('');
  const [curateLevel, setCurateLevel] = useState('intermediate');   // 초/중/고 abstraction level

  // AI key config (Curate needs MiniMax). Status comes from the backend; raw keys never returned.
  const [aiCfg, setAiCfg] = useState({ configured: false, count: 0, masked: [], configPath: '' });
  const [keyInput, setKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState('');
  const refreshAiCfg = async () => {
    try { const r = await fetch('/api/ai-config'); if (r.ok) setAiCfg(await r.json()); } catch (_) { /* backend down */ }
  };
  useEffect(() => { refreshAiCfg(); }, []);
  const saveKey = async () => {
    const raw = keyInput.trim();
    if (!raw) return;
    setSavingKey(true); setKeyMsg('');
    try {
      const keys = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);   // allow several keys
      const r = await fetch('/api/ai-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.success) { setKeyInput(''); setKeyMsg(`✅ ${d.count} key(s) saved`); await refreshAiCfg(); }
      else { setKeyMsg(`⚠️ ${(d && d.error) || `save failed (${r.status})`}`); }
    } catch (e) { setKeyMsg(`⚠️ ${e.message} — is the backend running?`); }
    finally { setSavingKey(false); }
  };

  const handleBlockifyClick = () => {
    if (onBlockify && blockifyMod.trim()) onBlockify(blockifyMod.trim());
  };
  const handleCurateClick = () => {
    if (onCurate && curateMod.trim() && curatePurpose.trim()) onCurate(curateMod.trim(), curatePurpose.trim(), curateLevel);
  };

  return (
    <div className="library-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-solid fa-cube icon-cyan"></i>
          <h3>Library Blocks</h3>
        </div>
        <span id="dynamic-blocks-count" className="badge badge-system">
          {installedBlocks.length} Blocks
        </span>
      </div>

      <div className="library-body">

        {/* ── Installed libraries (toolbox tabs) + delete ──── */}
        <div className="form-group">
          <div className="lib-manage-head">
            <label style={{ margin: 0 }}>Toolbox tabs</label>
            {userLibCount > 0 && (
              <button className="btn btn-secondary btn-xs" onClick={onClearLibraries} title="Remove all added libraries and curated tabs">
                <i className="fa-solid fa-trash-can"></i> Clear all
              </button>
            )}
          </div>
          <div className="lib-list">
            {libraries.length === 0 ? (
              <div className="empty-list-placeholder">No libraries yet. Install or blockify one below.</div>
            ) : libraries.map((l) => (
              <div key={l.lib} className={`lib-row${l.curation ? ' lib-row-curated' : ''}`} title={l.lib}>
                <span className="lib-row-name">
                  <i className={`fa-solid ${l.curation ? 'fa-star' : 'fa-layer-group'}`}></i> {l.lib}
                </span>
                <span className="lib-row-count">
                  {l.blockCount} block{l.blockCount !== 1 ? 's' : ''}{l.macroCount ? ` · ${l.macroCount} macro${l.macroCount !== 1 ? 's' : ''}` : ''}
                </span>
                {l.builtin ? (
                  <span className="lib-row-builtin" title="Built-in preset — comes back on reload">built-in</span>
                ) : (
                  <button className="lib-row-del" title={`Remove "${l.lib}"${l.curation ? ' (curated tab)' : ' and its toolbox tab'}`} onClick={() => onRemoveLibrary(l.lib)}>
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── 1) pip install → installs AND generates every block ──── */}
        <div className="form-group">
          <label htmlFor="pip-pkg-input">1 · Install a library — all blocks appear in the toolbox</label>
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
              placeholder="e.g. pydobot, pillow, numpy, mediapipe ..."
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={isAbstracting || !pipPkg.trim()}>
              {isAbstracting ? <i className="fa-solid fa-gear fa-spin"></i> : <i className="fa-solid fa-download"></i>} Install
            </button>
          </form>
          <small className="form-hint">Installs into the local Python and immediately introspects it — every function/method becomes a block (a <b>command</b> form and a <b>value</b> form) in its own toolbox tab.</small>
        </div>

        {/* ── Already-installed? Blockify by module name without re-installing ──── */}
        <div className="form-group">
          <label htmlFor="blockify-mod-input">Already installed? Generate blocks by module name</label>
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
              placeholder="e.g. pydobot, PIL.Image, numpy ..."
            />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={isAbstracting || !blockifyMod.trim()}>
              {isAbstracting ? <i className="fa-solid fa-gear fa-spin"></i> : <i className="fa-solid fa-cubes"></i>} Blockify
            </button>
          </form>
        </div>

        {/* ── 2) Curate → a small, purpose-driven subset in a NEW tab ──── */}
        <div className="form-group">
          <label htmlFor="curate-mod-input">2 · Curate — a few blocks for a goal, in a new ★ tab</label>
          <form
            className="pip-form"
            onSubmit={(e) => { e.preventDefault(); handleCurateClick(); }}
          >
            <input
              id="curate-mod-input"
              className="pip-input"
              type="text"
              value={curateMod}
              onChange={(e) => setCurateMod(e.target.value)}
              placeholder="module — e.g. pydobot"
              style={{ maxWidth: 160 }}
            />
            <input
              id="curate-purpose-input"
              className="pip-input"
              type="text"
              value={curatePurpose}
              onChange={(e) => setCuratePurpose(e.target.value)}
              placeholder="purpose — e.g. 픽 앤 플레이스: 이동·집기·놓기"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={isAbstracting || !curateMod.trim() || !curatePurpose.trim()}>
              {isAbstracting ? <i className="fa-solid fa-gear fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>} Curate
            </button>
          </form>
          {/* Abstraction level: same library, different granularity (초=고수준·각도만 … 고=저수준·PWM/타이밍). */}
          <div className="curate-level" role="radiogroup" aria-label="Abstraction level">
            <span className="curate-level-label">수준</span>
            {[['beginner', '초등', '고수준·직관 (각도만)'], ['intermediate', '중등', '핵심 파라미터'], ['advanced', '고등', '저수준·정밀 (PWM/타이밍)']].map(([val, ko, tip]) => (
              <button
                key={val}
                type="button"
                className={`curate-level-btn${curateLevel === val ? ' active' : ''}`}
                title={tip}
                aria-pressed={curateLevel === val}
                onClick={() => setCurateLevel(val)}
              >{ko}</button>
            ))}
          </div>
          <small className="form-hint">Keeps the full library tab and adds a separate <b>★ curated</b> tab — the AI picks just the blocks (grouped) needed for that goal, at the chosen <b>수준</b>. Needs an AI key (below).</small>

          {/* AI key — saved per-machine (NOT bundled into the build) */}
          <div className="ai-key-box">
            <div className="ai-key-status">
              <i className={`fa-solid ${aiCfg.configured ? 'fa-key icon-cyan' : 'fa-triangle-exclamation'}`}></i>
              {aiCfg.configured
                ? <span>AI key set — {aiCfg.count} key{aiCfg.count !== 1 ? 's' : ''} <code>{aiCfg.masked.join(', ')}</code></span>
                : <span>No AI key yet — Curate is disabled until you add one.</span>}
            </div>
            <form className="pip-form" onSubmit={(e) => { e.preventDefault(); saveKey(); }}>
              <input
                className="pip-input"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={aiCfg.configured ? 'replace key… (paste new)' : 'paste MiniMax API key (several: comma/newline)'}
                autoComplete="off"
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={savingKey || !keyInput.trim()}>
                {savingKey ? <i className="fa-solid fa-gear fa-spin"></i> : <i className="fa-solid fa-floppy-disk"></i>} Save
              </button>
            </form>
            <small className="form-hint">
              Stored only on this PC{aiCfg.configPath ? <> (<code>{aiCfg.configPath}</code>)</> : ''} — never committed or bundled into the .exe.
              {keyMsg ? <> · <b>{keyMsg}</b></> : null}
            </small>
          </div>
        </div>

        {/* AI thoughts */}
        <div className="ai-agent-panel">
          <div className="ai-panel-title">
            <i className="fa-solid fa-robot"></i> AI Reasoning
          </div>
          <div id="ai-chat-sim" className="ai-chat-body">
            {aiThoughts.length === 0
              ? <div className="thoughts-placeholder">Install or curate a library to see what was generated.</div>
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
                    <span className="dyn-block-type">{b.hasOutput ? 'value' : 'command'}</span>
                  </div>
                ))}
          </div>
        </div>

      </div>
    </div>
  );
}
