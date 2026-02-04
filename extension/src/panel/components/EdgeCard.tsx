import { useState } from 'preact/hooks';

interface EdgeCardProps {
  id: string;
  type: 'native' | 'email' | 'discord' | 'contact_link' | 'webhook';
  address: string;
  subtitle?: string | null;
  status: string;
  messageCount?: number;
  createdAt: string;
  onCopy: () => void;
  onDispose: () => void;
  onViewDocs?: () => void;
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
  onViewDocs,
  expandable = false 
}: EdgeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Neutral color scheme - native handles use slate, email uses sky, discord uses indigo, contact_link uses emerald, webhook uses purple
  const bgColor = type === 'native' ? 'bg-slate-100' : type === 'discord' ? 'bg-indigo-100' : type === 'contact_link' ? 'bg-emerald-100' : type === 'webhook' ? 'bg-purple-100' : 'bg-sky-100';
  const textColor = type === 'native' ? 'text-slate-600' : type === 'discord' ? 'text-indigo-600' : type === 'contact_link' ? 'text-emerald-600' : type === 'webhook' ? 'text-purple-600' : 'text-sky-600';
  const badgeColor = type === 'native' ? 'bg-slate-600' : type === 'discord' ? 'bg-indigo-500' : type === 'contact_link' ? 'bg-emerald-500' : type === 'webhook' ? 'bg-purple-500' : 'bg-sky-500';

  const icon = type === 'native' ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ) : type === 'discord' ? (
    // Discord logo icon
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  ) : type === 'contact_link' ? (
    // Link icon for contact links
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ) : type === 'webhook' ? (
    // Webhook icon (code bracket with arrow)
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
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
        class={`w-full flex items-center gap-3 p-3 bg-white border border-stone-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 transition-all mb-2 ${
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
      class={`bg-white border-2 border-stone-200 rounded-lg mb-3 overflow-hidden transition-all duration-200 shadow-sm hover:border-slate-300 ${
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
              {type.replace(/_/g, ' ')}
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
            {type === 'contact_link' && `${messageCount} conversations • `}
            {type === 'webhook' && `${messageCount} messages • `}
            Created {new Date(createdAt).toLocaleDateString()}
          </div>
          {type === 'contact_link' && status === 'active' && (
            <div class="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div class="text-xs text-emerald-700 font-medium mb-1">Shareable Link</div>
              <div class="flex items-center gap-2">
                <code class="flex-1 text-xs bg-white px-2 py-1 rounded border border-emerald-200 text-emerald-800 overflow-hidden text-ellipsis">
                  https://{address}
                </code>
                <button
                  class="px-2 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(`https://${address}`);
                    onCopy();
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          {type === 'webhook' && status === 'active' && onViewDocs && (
            <button 
              class="w-full mb-3 px-4 py-2 border border-purple-300 rounded-lg text-sm font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-400 transition-all duration-150 flex items-center justify-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onViewDocs();
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              View Documentation
            </button>
          )}
          {status === 'active' && (
            <div class="flex gap-2">
              {type !== 'contact_link' && type !== 'webhook' && (
                <button 
                  class="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-sm font-medium bg-white text-stone-900 hover:bg-stone-100 hover:border-slate-400 transition-all duration-150"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy();
                  }}
                >
                  Copy
                </button>
              )}
              <button 
                class={`${type !== 'contact_link' && type !== 'webhook' ? 'flex-1' : 'w-full'} px-4 py-2 border border-red-200 rounded-lg text-sm font-medium bg-white text-red-600 hover:bg-red-50 hover:border-red-600 transition-all duration-150`}
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
