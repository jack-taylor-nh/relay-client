import { render } from 'preact';
import { App } from './App';
import { checkIdentityState, sendMessage, loadEdgeTypes } from './state';
import { api } from '../lib/api';
import './styles.css';

// Initialize theme immediately to prevent flash
// This runs synchronously before render
(function initThemeEarly() {
  const STORAGE_KEY = 'relay-theme';
  
  // Try to get saved theme synchronously from localStorage first (for fast load)
  // The useTheme hook will reconcile with chrome.storage.local later
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
    // Silently fail - hook will handle it
  }
})();

// Set up API client authentication
async function setupApiAuth() {
  const state = await sendMessage<{ fingerprint: string | null }>({ type: 'GET_STATE' });
  if (state.fingerprint) {
    // Get public key
    const pkResult = await sendMessage<{ publicKey?: string; error?: string }>({ type: 'GET_PUBLIC_KEY' });
    if (pkResult.publicKey) {
      api.setAuth(state.fingerprint, pkResult.publicKey, async (message: string) => {
        const result = await sendMessage<{ signature?: string; error?: string }>({
          type: 'SIGN_MESSAGE',
          payload: { message },
        });
        if (result.error) throw new Error(result.error);
        return result.signature!;
      });
    }
  }
}

// Initialize
setupApiAuth();
checkIdentityState();
loadEdgeTypes(); // Load available edge types from server

render(<App />, document.getElementById('app')!);
