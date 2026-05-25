import React from 'react';
import ReactDOM from 'react-dom/client';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import App from './App.jsx';
import './styles/canvas.css';
import 'reactflow/dist/style.css';

// Use the locally bundled Monaco instead of loading from CDN (required in packaged Electron)
loader.config({ monaco });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
