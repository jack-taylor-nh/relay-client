/**
 * Button Component - Radix UI Migration
 * Uses Radix Button with Relay-specific prop mappings
 */

import { Button as RadixButton } from '@radix-ui/themes';
import type { ComponentChildren } from 'preact';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'soft' | 'outline';
  size?: 'sm' | 'md' | 'lg' | '1' | '2' | '3';
  icon?: ComponentChildren;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onClick?: (e: Event) => void;
  type?: 'button' | 'submit' | 'reset';
  children: ComponentChildren;
  className?: string;
}

export function Button({
  variant = 'soft',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  type = 'button',
  children,
  className = ''
}: ButtonProps) {
  // Map legacy variants to Radix variants and colors
  const getRadixProps = () => {
    switch (variant) {
      case 'primary':
        return { variant: 'solid' as const, color: 'blue' as const };
      case 'danger':
        return { variant: 'solid' as const, color: 'red' as const };
      case 'ghost':
        return { variant: 'ghost' as const, color: 'gray' as const };
      case 'secondary':
        return { variant: 'outline' as const, color: 'gray' as const };
      case 'soft':
      default:
        return { variant: 'soft' as const, color: 'gray' as const };
    }
  };

  // Map size to Radix size (1=sm, 2=md, 3=lg)
  const getRadixSize = () => {
    if (size === '1' || size === '2' || size === '3') return size;
    switch (size) {
      case 'sm': return '1' as const;
      case 'lg': return '3' as const;
      case 'md':
      default: return '2' as const;
    }
  };

  const { variant: radixVariant, color } = getRadixProps();
  const radixSize = getRadixSize();

  return (
    <RadixButton
      variant={radixVariant}
      color={color}
      size={radixSize}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
      type={type}
      className={`${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ width: fullWidth ? '100%' : undefined }}
    >
      {icon && <span>{icon}</span>}
      {children}
    </RadixButton>
  );
}
