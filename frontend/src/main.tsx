import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './tokens.css';
import './ids.css';
import './ids-light.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker disabled — was causing stale cache issues.
// The unregister script in index.html cleans up existing SW installations.
