import { render } from 'preact';
import { LocalLLMDocsView } from '../panel/views/LocalLLMDocsView';
import '../panel/styles.css';

// Initialize theme immediately to prevent flash
(function initThemeEarly() {
  const STORAGE_KEY = 'relay-theme';
  
  // Try to get saved theme from localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let isDark = false;
    if (saved === 'dark') {
      isDark = true;
    } else if (saved === 'light') {
      isDark = false;
    } else {
      // system or unset - use system preference
      isDark = systemDark;
    }
    
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch {
    // Silently fail
  }
})();

// Get parameters from URL
const params = new URLSearchParams(window.location.search);
const myEdgeId = params.get('myEdgeId') || '';
const myAuthToken = params.get('myAuthToken') || '';

// Render the docs view fullscreen (no modal wrapper)
render(
  <LocalLLMDocsView
    myEdgeId={myEdgeId}
    myAuthToken={myAuthToken}
    onClose={() => window.close()}
    onBridgeEdgeIdSubmit={(bridgeEdgeId) => {
      // Store bridge edge ID in localStorage for the extension to pick up
      try {
        localStorage.setItem('relay-llm-bridge-edge-id', bridgeEdgeId);
        console.log('[LocalLLM Docs] Saved bridge edge ID:', bridgeEdgeId);
      } catch (error) {
        console.error('[LocalLLM Docs] Failed to save bridge edge ID:', error);
      }
    }}
  />,
  document.getElementById('root')!
);
