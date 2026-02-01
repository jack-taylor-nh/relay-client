import { activeTab, type Tab } from '../App';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'new', label: 'New', icon: 'plus' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
];

function TabIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'inbox':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 12h-6l-2 3H10l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
      );
    case 'plus':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'wallet':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12V7H5a2 2 0 010-4h14v4" />
          <path d="M3 5v14a2 2 0 002 2h16v-5" />
          <path d="M18 12a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      );
    default:
      return null;
  }
}

export function TabBar() {
  return (
    <nav class="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          class={`tab-item ${activeTab.value === tab.id ? 'active' : ''}`}
          onClick={() => (activeTab.value = tab.id)}
        >
          <span class="tab-icon">
            <TabIcon icon={tab.icon} />
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
