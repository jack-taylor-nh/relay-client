import { currentIdentity, lockWallet, showToast } from '../state';
import { formatHandle } from '../../types';
import { isFullscreenMode } from '../App';

export function Header() {
  const handle = currentIdentity.value?.handle;
  const isFullscreen = isFullscreenMode();
  
  async function handleLock() {
    await lockWallet();
    showToast('Relay locked');
  }

  function handleClose() {
    window.close();
  }
  
  async function handleExpand() {
    // Open fullscreen version in new tab
    const fullscreenUrl = chrome.runtime.getURL('fullscreen/index.html');
    await chrome.tabs.create({ url: fullscreenUrl });
    // Close the sidebar after opening fullscreen
    window.close();
  }

  async function handleCollapse() {
    // Try to open sidebar first
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow.id) {
        await chrome.sidePanel.open({ windowId: currentWindow.id });
      }
    } catch (e) {
      console.log('Could not open sidebar:', e);
    }
    
    // Try to close this tab - will work if opened by extension
    // If it doesn't close, redirect to userelay.org
    try {
      const currentTab = await chrome.tabs.getCurrent();
      if (currentTab?.id) {
        await chrome.tabs.remove(currentTab.id);
      }
    } catch (e) {
      // Tab can't be closed (e.g., user navigated to it directly)
      // Redirect to our website instead
      window.location.href = 'https://userelay.org';
    }
  }
  
  return (
    <header class="flex items-center justify-between px-4 py-3 bg-white border-b border-stone-200">
      <div class="flex items-center">
        {/* Relay glyph - brand gradient */}
        <svg width="28" height="28" viewBox="20 20 216 216" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="relay-gradient-header" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#38BDF8"/>
              <stop offset="0.55" stop-color="#60A5FA"/>
              <stop offset="1" stop-color="#A5B4FC"/>
            </linearGradient>
          </defs>
          <g transform="translate(128 128) scale(1.14) translate(-128 -128)">
            <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22"
                  fill="none" stroke="url(#relay-gradient-header)" stroke-width="18"
                  stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M118 148l52 28" fill="none" stroke="url(#relay-gradient-header)"
                  stroke-width="18" stroke-linecap="round"/>
            <circle cx="188" cy="176" r="10" fill="url(#relay-gradient-header)"/>
          </g>
        </svg>
      </div>
      
      <div class="flex items-center gap-2">
        {handle && (
          <button 
            class="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 hover:border-slate-300 transition-all duration-150 cursor-pointer"
            onClick={() => {
              navigator.clipboard.writeText(formatHandle(handle));
              showToast('Handle copied!');
            }}
            title="Click to copy"
          >
            {formatHandle(handle)}
          </button>
        )}
        
        <button
          class="p-2 text-stone-600 hover:text-slate-700 hover:bg-stone-100 rounded-md transition-all duration-150 cursor-pointer"
          onClick={handleLock}
          title="Lock Relay"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="10" width="16" height="12" rx="2" />
            <path d="M8 10V6a4 4 0 118 0v4" stroke-linecap="round" />
          </svg>
        </button>

        {/* Expand/Collapse button */}
        {isFullscreen ? (
          <button
            class="p-2 text-stone-600 hover:text-slate-700 hover:bg-stone-100 rounded-md transition-all duration-150 cursor-pointer"
            onClick={handleCollapse}
            title="Return to sidebar"
          >
            {/* Collapse/minimize icon - arrows pointing inward */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        ) : (
          <button
            class="p-2 text-stone-600 hover:text-slate-700 hover:bg-stone-100 rounded-md transition-all duration-150 cursor-pointer"
            onClick={handleExpand}
            title="Open in new tab"
          >
            {/* Expand icon - arrows pointing outward */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}

        {/* Only show close button in sidebar mode */}
        {!isFullscreen && (
          <button
            class="p-2 text-stone-600 hover:text-red-600 hover:bg-stone-100 rounded-md transition-all duration-150 cursor-pointer"
            onClick={handleClose}
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
