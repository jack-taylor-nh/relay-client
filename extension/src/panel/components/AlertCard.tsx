import { ComponentChildren } from 'preact';

interface AlertCardProps {
  type?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ComponentChildren;
  className?: string;
}

export function AlertCard({ type = 'info', title, children, className = '' }: AlertCardProps) {
  const getIconColor = () => {
    switch (type) {
      case 'warning':
        return 'text-[var(--color-warning)]';
      case 'error':
        return 'text-[var(--color-error)]';
      case 'success':
        return 'text-[var(--color-success)]';
      default: // info
        return 'text-[var(--color-accent)]';
    }
  };

  const getIcon = () => {
    const iconColor = getIconColor();
    switch (type) {
      case 'warning':
        return (
          <svg class={`w-5 h-5 flex-shrink-0 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'error':
        return (
          <svg class={`w-5 h-5 flex-shrink-0 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'success':
        return (
          <svg class={`w-5 h-5 flex-shrink-0 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      default: // info
        return (
          <svg class={`w-5 h-5 flex-shrink-0 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  return (
    <div class={`bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg p-4 ${className}`}>
      <div class="flex items-start gap-3">
        {getIcon()}
        <div class="flex-1 min-w-0">
          {title && (
            <h3 class="text-sm font-semibold mb-2 text-[var(--color-text-primary)]">
              {title}
            </h3>
          )}
          <div class="text-sm text-[var(--color-text-primary)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
