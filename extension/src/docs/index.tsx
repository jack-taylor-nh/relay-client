import { render } from 'preact';
import { WebhookDocsView } from '../panel/views/WebhookDocsView';
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
const edgeId = params.get('edgeId') || '';
const webhookUrl = params.get('webhookUrl') || '';
const authToken = params.get('authToken') || '';

// Render the docs view fullscreen (no modal wrapper)
render(
  <WebhookDocsView
    edgeId={edgeId}
    webhookUrl={webhookUrl}
    authToken={authToken}
    onClose={() => window.close()}
  />,
  document.getElementById('root')!
);
