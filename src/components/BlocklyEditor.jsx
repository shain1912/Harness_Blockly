import React, { useEffect, useRef } from 'react';

export default function BlocklyEditor({
  onCodeChange,
  onSnapshotChange,
  initialSnapshot,
  isSyncingFromCode,
  workspaceRef,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scratch3/MakeCode-style light theme for the zelos renderer.
    const getBlocklyTheme = () => {
      const base = window.Blockly.Themes.Zelos || window.Blockly.Themes.Classic;
      return window.Blockly.Theme.defineTheme('scratch_light', {
        'base': base,
        'componentStyles': {
          'workspaceBackgroundColour': '#faf9f5',
          'toolboxBackgroundColour': '#ffffff',
          'toolboxForegroundColour': '#3d3d3a',
          'flyoutBackgroundColour': '#f5f0e8',
          'flyoutForegroundColour': '#3d3d3a',
          'flyoutOpacity': 1,
          'scrollbarColour': '#e6dfd8',
          'scrollbarOpacity': 0.8,
          'insertionMarkerColour': '#cc785c',
          'insertionMarkerOpacity': 0.3,
          'cursorColour': '#cc785c'
        },
        'blockStyles': {
          'logic_blocks': { 'colourPrimary': '#4C97FF' },
          'loop_blocks': { 'colourPrimary': '#FFAB19' },
          'math_blocks': { 'colourPrimary': '#59C059' },
          'text_blocks': { 'colourPrimary': '#5CB1D6' },
          'list_blocks': { 'colourPrimary': '#9966FF' },
          'variable_blocks': { 'colourPrimary': '#FF8C1A' },
          'procedure_blocks': { 'colourPrimary': '#FF6680' }
        }
      });
    };

    // Grab toolbox element from document
    const toolbox = document.getElementById('toolbox');

    // Inject Blockly
    const ws = window.Blockly.inject(containerRef.current, {
      toolbox: toolbox,
      theme: getBlocklyTheme(),
      renderer: 'zelos',
      grid: {
        spacing: 20,
        length: 3,
        colour: 'rgba(0, 0, 0, 0.06)',
        snap: true
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.85,
        maxScale: 3,
        minScale: 0.3,
        scaleSpeed: 1.2
      },
      trashcan: true
    });

    workspaceRef.current = ws;
    window.__blocklyWorkspace = ws;

    // MakeCode-style toolbox: paint each category label in its own colour-bar hue.
    // Blockly puts the category colour on the row's left border (inline); copy it to the
    // label text so the palette reads like MakeCode (colored bar + colored label).
    const paintToolboxLabels = () => {
      const cats = containerRef.current?.querySelectorAll('.blocklyToolboxCategory') || [];
      cats.forEach((cat) => {
        const hue = getComputedStyle(cat).borderLeftColor;
        const label = cat.querySelector('.blocklyToolboxCategoryLabel');
        if (label && hue) label.style.color = hue;
      });
    };
    const paintTimer = setTimeout(paintToolboxLabels, 250);

    // Load initial snapshot if provided
    if (initialSnapshot) {
      try {
        window.Blockly.serialization.workspaces.load(initialSnapshot, ws);
      } catch (err) {
        console.error('Failed to load initial snapshot:', err);
      }
    }

    // Listener for changes
    const changeListener = (event) => {
      if (isSyncingFromCode.current) return;

      if (
        event.type === window.Blockly.Events.BLOCK_CREATE ||
        event.type === window.Blockly.Events.BLOCK_DELETE ||
        event.type === window.Blockly.Events.BLOCK_CHANGE ||
        event.type === window.Blockly.Events.BLOCK_MOVE
      ) {
        try {
          const code = window.Blockly.Python.workspaceToCode(ws);
          const snapshot = window.Blockly.serialization.workspaces.save(ws);
          onCodeChange(code);
          onSnapshotChange(snapshot);
        } catch (err) {
          console.error('Error generating code on workspace change:', err);
        }
      }
    };

    ws.addChangeListener(changeListener);

    // Cleanup
    return () => {
      clearTimeout(paintTimer);
      ws.removeChangeListener(changeListener);
      ws.dispose();
      workspaceRef.current = null;
      if (window.__blocklyWorkspace === ws) {
        window.__blocklyWorkspace = null;
      }
    };
  }, []);

  return (
    <div className="blockly-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-solid fa-cubes icon-purple"></i>
          <h3>Visual Block Workspace</h3>
        </div>
        <div id="sync-indicator" className="badge badge-success" title="Block ↔ Python synced">
          <i className="fa-solid fa-rotate"></i> Synchronized
        </div>
      </div>
      <div 
        ref={containerRef} 
        id="blockly-div" 
        style={{ width: '100%', height: 'calc(100% - 48px)', minHeight: '380px' }}
      ></div>
    </div>
  );
}
