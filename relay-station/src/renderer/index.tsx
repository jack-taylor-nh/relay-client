import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ============================================
// Network Event Listeners
// ============================================

// Listen for network online event
window.addEventListener('online', () => {
  console.log('[Renderer] Network online detected');
  window.electron.ipcRenderer.invoke('network-online').catch((err: any) => {
    console.error('[Renderer] Failed to notify main process of network online:', err);
  });
});

// Listen for network offline event
window.addEventListener('offline', () => {
  console.log('[Renderer] Network offline detected');
  window.electron.ipcRenderer.invoke('network-offline').catch((err: any) => {
    console.error('[Renderer] Failed to notify main process of network offline:', err);
  });
});

// Log initial network state
console.log('[Renderer] Initial network state:', navigator.onLine ? 'online' : 'offline');
