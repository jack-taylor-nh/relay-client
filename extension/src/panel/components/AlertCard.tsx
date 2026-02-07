/**
 * AlertCard Component - Radix UI Migration
 * Uses Radix Callout for consistent alert styling
 */

import { Callout } from '@radix-ui/themes';
import { InfoCircledIcon, CheckCircledIcon, ExclamationTriangleIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import type { ComponentChildren } from 'preact';

interface AlertCardProps {
  type?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ComponentChildren;
  className?: string;
}

export function AlertCard({ type = 'info', title, children, className = '' }: AlertCardProps) {
  // Map type to Radix color and icon
  const getConfig = () => {
    switch (type) {
      case 'warning':
        return { color: 'yellow' as const, icon: <ExclamationTriangleIcon /> };
      case 'error':
        return { color: 'red' as const, icon: <CrossCircledIcon /> };
      case 'success':
        return { color: 'green' as const, icon: <CheckCircledIcon /> };
      default: // info
        return { color: 'blue' as const, icon: <InfoCircledIcon /> };
    }
  };

  const { color, icon } = getConfig();

  return (
    <Callout.Root color={color} className={className}>
      <Callout.Icon>
        {icon}
      </Callout.Icon>
      <Callout.Text>
        {title && <strong>{title}: </strong>}
        {children}
      </Callout.Text>
    </Callout.Root>
  );
}
