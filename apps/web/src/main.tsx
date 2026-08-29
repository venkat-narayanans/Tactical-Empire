import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { assertConfigIntegrity } from '@te/config';
import { App } from './App.js';
import './styles/global.css';

// Fail loudly at boot rather than rendering a board built from a broken config.
assertConfigIntegrity();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
