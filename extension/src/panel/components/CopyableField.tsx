import { useState } from 'preact/hooks';

interface CopyableFieldProps {
  value: string;
  label?: string;
  helperText?: string;
  onCopy?: () => void;
  className?: string;
}

export function CopyableField({ value, label, helperText, onCopy, className = '' }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div class={className}>
      {label && (
        <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div class="flex items-center gap-2">
        <code class="flex-1 font-mono text-xs px-3 py-2 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text-primary)]">
          {value}
        </code>
        <button 
          class={`p-1.5 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded cursor-pointer transition-all duration-200 flex-shrink-0 ${
            copied 
              ? 'text-[var(--color-success)] border-[var(--color-success)]' 
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-text-primary)]'
          }`}
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>
      </div>
      {helperText && (
        <small class="block mt-1 text-xs text-[var(--color-text-tertiary)]">{helperText}</small>
      )}
    </div>
  );
}
