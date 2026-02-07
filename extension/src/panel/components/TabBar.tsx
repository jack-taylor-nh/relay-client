/**
 * TabBar Component - Enhanced with Radix Icons
 * Custom tab navigation for extension (not using Radix Tabs due to custom layout needs)
 */

import { activeTab, type Tab } from '../App';
import { hasUnreadMessages } from '../state';
import { 
  EnvelopeClosedIcon, 
  PlusCircledIcon, 
  LinkBreak2Icon, 
  PersonIcon 
} from '@radix-ui/react-icons';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'new', label: 'New', icon: 'plus' },
  { id: 'edges', label: 'Edges', icon: 'edges' },
  { id: 'identity', label: 'Identity', icon: 'user' },
];

function TabIcon({ icon }: { icon: string }) {
  const iconProps = { width: 20, height: 20 };
  
  switch (icon) {
    case 'inbox':
      return <EnvelopeClosedIcon {...iconProps} />;
    case 'plus':
      return <PlusCircledIcon {...iconProps} />;
    case 'edges':
      return <LinkBreak2Icon {...iconProps} />;
    case 'user':
      return <PersonIcon {...iconProps} />;
    default:
      return null;
  }
}

export function TabBar() {
  const showUnreadDot = hasUnreadMessages.value;
  
  return (
    <nav class="flex" style={{ background: 'var(--gray-1)', borderTop: '1px solid var(--gray-6)' }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          class={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-sm font-medium transition-all duration-150 relative ${
            activeTab.value === tab.id
              ? 'text-[var(--gray-12)]'
              : 'text-[var(--gray-9)] hover:text-[var(--gray-11)]'
          }`}
          style={{
            background: activeTab.value === tab.id ? 'var(--gray-3)' : 'transparent',
            cursor: 'pointer'
          }}
          onClick={() => (activeTab.value = tab.id)}
        >
          {activeTab.value === tab.id && (
            <span class="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'var(--blue-9)' }} />
          )}
          {/* Blue dot indicator for unread messages on inbox tab */}
          {tab.id === 'inbox' && showUnreadDot && activeTab.value !== 'inbox' && (
            <span class="absolute top-2 right-1/4 w-2 h-2 rounded-full" style={{ background: 'var(--blue-9)' }} />
          )}
          <span style={{ color: activeTab.value === tab.id ? 'var(--gray-12)' : 'var(--gray-9)' }}>
            <TabIcon icon={tab.icon} />
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
