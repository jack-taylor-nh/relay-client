import { ComponentChildren } from 'preact';

interface ListItemCardProps {
  icon: ComponentChildren;
  iconColor?: string;
  title: string;
  tags?: string[];
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  onClick?: () => void;
  className?: string;
}

export function ListItemCard({ 
  icon, 
  iconColor = 'text-[var(--color-text-secondary)]',
  title, 
  tags = [], 
  action,
  onClick,
  className = '' 
}: ListItemCardProps) {
  const Container = onClick ? 'button' : 'div';
  
  return (
    <Container
      onClick={onClick}
      class={`w-full flex items-center gap-4 px-4 py-4 border-b border-[var(--color-border-default)] transition-colors ${
        onClick ? 'hover:bg-[var(--color-bg-hover)] cursor-pointer' : ''
      } ${className}`}
    >
      {/* Icon */}
      <div class={`flex-shrink-0 w-6 h-6 flex items-center justify-center ${iconColor}`}>
        {icon}
      </div>

      {/* Title */}
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {title}
        </h3>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div class="flex items-center gap-2 flex-shrink-0">
          {tags.map((tag, index) => (
            <span 
              key={index}
              class="text-xs text-[var(--color-text-secondary)] capitalize"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Action */}
      {action && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          class={`flex items-center gap-1 text-sm font-medium transition-colors flex-shrink-0 ${
            action.variant === 'secondary' 
              ? 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]' 
              : 'text-[var(--color-text-primary)] hover:text-[var(--color-accent)]'
          }`}
        >
          {action.label}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </Container>
  );
}
