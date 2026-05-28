import React, { useEffect, useRef } from 'react';

export default function BlocklyEditor({ 
  onCodeChange, 
  onSnapshotChange, 
  initialSnapshot, 
  isSyncingFromCode, 
  workspaceRef 
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Defined Dark/Cyber Theme for Blockly
    const getBlocklyTheme = () => {
      return window.Blockly.Theme.defineTheme('cyber_dark', {
        'base': window.Blockly.Themes.Classic,
        'componentStyles': {
          'workspaceBackgroundColour': '#0c0f1b',
          'toolboxBackgroundColour': '#0e1220',
          'toolboxTextColour': '#94a3b8',
          'flyoutBackgroundColour': '#0e1220',
          'flyoutTextColour': '#94a3b8',
          'scrollbarColour': '#64748b',
          'scrollbarOpacity': 0.4
        },
        'blockStyles': {
          'logic_blocks': { 'colourPrimary': '#5b80a5' },
          'loop_blocks': { 'colourPrimary': '#5ba55b' },
          'math_blocks': { 'colourPrimary': '#5b67a5' },
          'text_blocks': { 'colourPrimary': '#5ba5a5' },
          'list_blocks': { 'colourPrimary': '#745ba5' },
          'variable_blocks': { 'colourPrimary': '#a55b80' }
        }
      });
    };

    // Grab toolbox element from document
    const toolbox = document.getElementById('toolbox');

    // Inject Blockly
    const ws = window.Blockly.inject(containerRef.current, {
      toolbox: toolbox,
      theme: getBlocklyTheme(),
      renderer: 'geras',
      grid: {
        spacing: 20,
        length: 3,
        colour: 'rgba(255, 255, 255, 0.05)',
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
        <div id="sync-indicator" className="badge badge-success">
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
