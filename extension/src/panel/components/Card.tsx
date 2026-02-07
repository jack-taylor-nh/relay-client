/**
 * Card Component - Radix UI Migration
 * Uses Radix Card for consistent surface styling
 */

import { Card as RadixCard } from '@radix-ui/themes';
import type { ComponentChildren } from 'preact';

interface CardProps {
  children: ComponentChildren;
  variant?: 'surface' | 'classic' | 'ghost';
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
  asChild?: boolean;
}

export function Card({ 
  children, 
  variant = 'surface',
  className = '',
  onClick,
  interactive = false,
  asChild = false
}: CardProps) {
  return (
    <RadixCard
      variant={variant}
      className={`${className} ${interactive || onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      asChild={asChild}
      style={interactive || onClick ? { transition: 'all 150ms' } : undefined}
    >
      {children}
    </RadixCard>
  );
}
