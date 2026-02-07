/**
 * Modal Component - Radix UI Migration
 * Uses Radix Dialog for accessible modals
 */

import { Dialog, Flex, Button } from '@radix-ui/themes';
import type { ComponentChildren } from 'preact';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | '1' | '2' | '3' | '4';
  children: ComponentChildren;
  showCloseButton?: boolean;
  footer?: ComponentChildren;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  showCloseButton = true,
  footer
}: ModalProps) {
  // Map size to Radix Dialog size
  const getRadixSize = () => {
    if (size === '1' || size === '2' || size === '3' || size === '4') return size;
    switch (size) {
      case 'sm': return '2' as const;
      case 'lg': return '4' as const;
      case 'md':
      default: return '3' as const;
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <Dialog.Content size={getRadixSize()}>
        <Dialog.Title>{title}</Dialog.Title>
        {description && <Dialog.Description>{description}</Dialog.Description>}
        
        {children}
        
        {footer && (
          <Flex gap="3" mt="4" justify="end">
            {footer}
          </Flex>
        )}
        
        {!showCloseButton && <Dialog.Close />}
      </Dialog.Content>
    </Dialog.Root>
  );
}

/**
 * ConfirmModal - Specialized modal for confirmation dialogs
 */
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  children?: ComponentChildren;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  children
}: ConfirmModalProps) {
  const color = confirmVariant === 'danger' ? 'red' : 'blue';
  
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <Dialog.Content size="3">
        <Dialog.Title>{title}</Dialog.Title>
        {description && <Dialog.Description>{description}</Dialog.Description>}
        
        {children}
        
        <Flex gap="3" mt="4" justify="end">
          <Button variant="soft" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="solid" color={color} onClick={() => {
            onConfirm();
            onClose();
          }}>
            {confirmLabel}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
