import { currentIdentity, lockWallet, showToast } from '../state';
import { formatHandle } from '../../types';

export function Header() {
  const handle = currentIdentity.value?.handle;
  
  async function handleLock() {
    await lockWallet();
    showToast('Relay locked');
  }

  function handleClose() {
    window.close();
  }
  
  return (
    <header class="flex items-center justify-between px-4 py-3 bg-white border-b border-stone-200">
      <div class="flex items-center">
        <svg width="28" height="28" viewBox="65 58 145 138" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="relay-gradient-header" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#22D3EE"/>
              <stop offset="0.55" stop-color="#8B5CF6"/>
              <stop offset="1" stop-color="#10B981"/>
            </linearGradient>
          </defs>
          <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22"
                fill="none" stroke="url(#relay-gradient-header)" stroke-width="18"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M118 148l52 28" fill="none" stroke="url(#relay-gradient-header)"
                stroke-width="18" stroke-linecap="round"/>
          <circle cx="188" cy="176" r="10" fill="url(#relay-gradient-header)"/>
        </svg>
      </div>
      
      <div class="flex items-center gap-2">
        {handle && (
          <button 
            class="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 hover:border-purple-300 transition-all duration-150 cursor-pointer"
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
          class="p-2 text-stone-600 hover:text-purple-600 hover:bg-stone-100 rounded-md transition-all duration-150 cursor-pointer"
          onClick={handleLock}
          title="Lock Relay"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="10" width="16" height="12" rx="2" />
            <path d="M8 10V6a4 4 0 118 0v4" stroke-linecap="round" />
          </svg>
        </button>

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
      </div>
    </header>
  );
}
