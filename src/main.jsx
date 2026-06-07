import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Import compiler utilities so they are bundled by Vite and register globally
import './utils/parser.js';
import './utils/desugarer.js';
import './utils/libraryAbstraction.js';
import './utils/pyAstBridge.js';
import './examples/snippets.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
