import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Import compiler utilities so they are bundled by Vite and register globally
import './utils/parser.js';
import './utils/desugarer.js';
import './utils/libraryAbstraction.js';
import './utils/libRegistry.js';   // Phase 5: window.BlockPyLibRegistry (load before irToolbox.js)
import './utils/pyAstBridge.js';
import './utils/irToBlockly.js';
import './utils/blocklyToIr.js';
import './utils/irDesugar.js';   // Phase 4: window.BlockPyIrDesugar (optional IR->IR desugar pass)
import './utils/irBlocks.js';
import './utils/irToolbox.js';   // builds window.BlockPyIrToolbox (load-order only matters for the live coverage test, which compares against the irBlocks.js registry)
import './examples/snippets.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
