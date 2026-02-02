import { activeTab, type Tab } from '../App';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'new', label: 'New', icon: 'plus' },
  { id: 'edges', label: 'Edges', icon: 'edges' },
  { id: 'identity', label: 'Identity', icon: 'user' },
];

function TabIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'inbox':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 12h-6l-2 3H10l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
      );
    case 'plus':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'user':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'edges':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    default:
      return null;
  }
}

export function TabBar() {
  return (
    <nav class="flex bg-white border-t border-stone-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          class={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-sm font-medium transition-all duration-150 relative ${
            activeTab.value === tab.id
              ? 'text-purple-600 bg-purple-50'
              : 'text-stone-600 hover:text-purple-600 hover:bg-stone-50'
          }`}
          onClick={() => (activeTab.value = tab.id)}
        >
          {activeTab.value === tab.id && (
            <span class="absolute top-0 left-0 right-0 h-0.5 bg-purple-600" />
          )}
          <span class={activeTab.value === tab.id ? 'text-purple-600' : 'text-stone-500'}>
            <TabIcon icon={tab.icon} />
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
