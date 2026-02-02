import { useState } from 'preact/hooks';

interface EdgeCardProps {
  id: string;
  type: 'native' | 'email';
  address: string;
  subtitle?: string | null;
  status: string;
  messageCount?: number;
  createdAt: string;
  onCopy: () => void;
  onDispose: () => void;
  expandable?: boolean;
}

export function EdgeCard({ 
  id, 
  type, 
  address, 
  subtitle, 
  status, 
  messageCount = 0, 
  createdAt, 
  onCopy, 
  onDispose,
  expandable = false 
}: EdgeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const bgColor = type === 'native' ? 'bg-purple-100' : 'bg-cyan-100';
  const textColor = type === 'native' ? 'text-purple-600' : 'text-cyan-600';
  const badgeColor = type === 'native' ? 'bg-purple-600' : 'bg-blue-500';

  const icon = type === 'native' ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );

  if (!expandable) {
    // Simple card for selection (New tab)
    return (
      <button
        class={`w-full flex items-center gap-3 p-3 bg-white border border-stone-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all mb-2 ${
          status !== 'active' ? 'opacity-60' : ''
        }`}
      >
        <div class={`flex-shrink-0 w-10 h-10 flex items-center justify-center ${bgColor} ${textColor} rounded-full`}>
          {icon}
        </div>
        <div class="flex-1 text-left">
          <div class="text-sm font-semibold text-stone-900">{address}</div>
          {subtitle && <div class="text-xs text-stone-600">{subtitle}</div>}
          {type === 'email' && messageCount > 0 && (
            <div class="text-xs text-stone-500 mt-0.5">{messageCount} messages</div>
          )}
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-stone-400">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    );
  }

  // Expandable card for management (Edges tab)
  return (
    <div 
      class={`bg-white border-2 border-stone-200 rounded-lg mb-3 overflow-hidden transition-all duration-200 shadow-sm hover:border-purple-300 ${
        status !== 'active' ? 'opacity-60' : ''
      }`}
    >
      <button
        class="w-full flex items-center gap-3 p-3 hover:bg-stone-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div class={`flex-shrink-0 w-10 h-10 flex items-center justify-center ${bgColor} ${textColor} rounded-full`}>
          {icon}
        </div>
        <div class="flex-1 text-left">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold text-stone-900">{address}</span>
            <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${badgeColor} text-white`}>
              {type}
            </span>
            {status !== 'active' && (
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-stone-100 text-stone-500">
                {status}
              </span>
            )}
          </div>
          {subtitle && <div class="text-xs text-stone-600 mt-1">{subtitle}</div>}
        </div>
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2" 
          class={`text-stone-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isExpanded && (
        <div class="px-4 pb-3 border-t border-stone-200 bg-stone-50">
          <div class="text-xs text-stone-500 mt-3 mb-3">
            {type === 'email' && `${messageCount} messages • `}
            Created {new Date(createdAt).toLocaleDateString()}
          </div>
          {status === 'active' && (
            <div class="flex gap-2">
              <button 
                class="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-sm font-medium bg-white text-stone-900 hover:bg-stone-100 hover:border-purple-600 transition-all duration-150"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
              >
                Copy
              </button>
              <button 
                class="flex-1 px-4 py-2 border border-red-200 rounded-lg text-sm font-medium bg-white text-red-600 hover:bg-red-50 hover:border-red-600 transition-all duration-150"
                onClick={(e) => {
                  e.stopPropagation();
                  onDispose();
                }}
              >
                Dispose
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
