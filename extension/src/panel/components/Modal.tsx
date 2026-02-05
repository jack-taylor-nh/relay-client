import { ComponentChildren } from 'preact';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  children: ComponentChildren;
  showCloseButton?: boolean;
}

/**
 * Unified Modal component for consistent UI/UX across the app
 * Supports light/dark theme and matches design system
 */
export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  showCloseButton = true
}: ModalProps) {
  if (!isOpen) return null;

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'max-w-[400px]';
      case 'lg':
        return 'max-w-[600px]';
      case 'md':
      default:
        return 'max-w-[480px]';
    }
  };

  return (
    <div 
      class="fixed inset-0 bg-[var(--color-bg-overlay)] flex items-center justify-center z-[1000] backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        class={`bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl w-full shadow-2xl ${getSizeClasses()}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-default)]">
          <h3 class="m-0 text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
          {showCloseButton && (
            <button
              onClick={onClose}
              class="p-1 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div class="px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * ConfirmModal - Specialized modal for confirmation dialogs (like disposal)
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
  if (!isOpen) return null;

  return (
    <div 
      class="fixed inset-0 bg-[var(--color-bg-overlay)] flex items-center justify-center z-[1000] backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        class="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl max-w-[480px] w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="px-6 py-4 border-b border-[var(--color-border-default)]">
          <h3 class="m-0 text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
        </div>

        {/* Content */}
        <div class="px-6 py-5">
          {description && (
            <p class="text-sm text-[var(--color-text-secondary)] m-0 mb-4">{description}</p>
          )}
          {children}
        </div>

        {/* Actions */}
        <div class="px-6 py-4 border-t border-[var(--color-border-default)] flex gap-3">
          <button
            onClick={onClose}
            class="flex-1 px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            class={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              confirmVariant === 'danger'
                ? 'text-white bg-[var(--color-error)] hover:opacity-90'
                : 'text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
