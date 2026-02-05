import { ComponentChildren } from 'preact';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: ComponentChildren;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onClick?: (e: Event) => void;
  type?: 'button' | 'submit' | 'reset';
  children: ComponentChildren;
  className?: string;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  type = 'button',
  children,
  className = ''
}: ButtonProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] border-transparent';
      case 'danger':
        return 'bg-[var(--color-error)] text-white hover:bg-[var(--color-error)] hover:opacity-90 border-transparent';
      case 'ghost':
        return 'bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] border-transparent';
      case 'secondary':
      default:
        return 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] border-[var(--color-border-default)]';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-3 py-1.5 text-xs';
      case 'lg':
        return 'px-6 py-3 text-base';
      case 'md':
      default:
        return 'px-4 py-2 text-sm';
    }
  };

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      class={`
        inline-flex items-center justify-center gap-2 font-medium rounded-lg
        border transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${getVariantClasses()}
        ${getSizeClasses()}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading && (
        <svg class="animate-spin" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span class="flex-shrink-0" style={`width: ${iconSize}px; height: ${iconSize}px;`}>
          {icon}
        </span>
      )}
      <span>{children}</span>
      {!loading && icon && iconPosition === 'right' && (
        <span class="flex-shrink-0" style={`width: ${iconSize}px; height: ${iconSize}px;`}>
          {icon}
        </span>
      )}
    </button>
  );
}
