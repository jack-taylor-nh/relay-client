import { currentIdentity, lockWallet, showToast } from '../state';
import { formatHandle } from '../../types';

export function Header() {
  const handle = currentIdentity.value?.handle;
  
  async function handleLock() {
    await lockWallet();
    showToast('Wallet locked');
  }
  
  return (
    <header class="app-header">
      <div class="header-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 6h16M4 12h12M4 18h14" stroke-linecap="round" />
          <circle cx="20" cy="18" r="2" fill="currentColor" />
        </svg>
        <span>Relay</span>
      </div>
      
      <div class="header-actions">
        {handle && (
          <button 
            class="handle-chip"
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
          class="header-btn"
          onClick={handleLock}
          title="Lock wallet"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="10" width="16" height="12" rx="2" />
            <path d="M8 10V6a4 4 0 118 0v4" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}
