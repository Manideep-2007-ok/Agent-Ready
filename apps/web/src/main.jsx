import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './design/fonts.css';
import './design/tokens.css';
import './tailwind.css';
import './design/kit.css';
import './shell/shell.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
