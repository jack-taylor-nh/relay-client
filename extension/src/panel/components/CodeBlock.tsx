import { useEffect, useRef } from 'preact/hooks';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-json';

interface CodeBlockProps {
  code: string;
  language: string;
  maxHeight?: string;
  showLanguageLabel?: boolean;
}

/**
 * Shared theme-aware code block component with syntax highlighting
 * Used in webhook messages and documentation
 */
export function CodeBlock({ code, language, maxHeight = '300px', showLanguageLabel = false }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  return (
    <div class="code-block-wrapper">
      {showLanguageLabel && (
        <div class="code-block-language-label">
          {language}
        </div>
      )}
      <pre 
        class="code-block-pre" 
        style={{ maxHeight }}
      >
        <code 
          ref={codeRef} 
          class={`language-${language}`}
        >
          {code.trim()}
        </code>
      </pre>
      <style>{`
        .code-block-wrapper {
          position: relative;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border-default);
          border-radius: 6px;
          overflow: hidden;
        }
        
        .code-block-language-label {
          position: absolute;
          top: 8px;
          left: 12px;
          font-size: 10px;
          font-weight: 600;
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          z-index: 1;
        }
        
        .code-block-pre {
          margin: 0;
          padding: 12px;
          overflow-x: auto;
          overflow-y: auto;
          background: var(--color-bg-elevated);
        }
        
        .code-block-pre code {
          font-family: var(--font-mono, 'SF Mono', Monaco, Consolas, monospace);
          font-size: 11px;
          line-height: 1.5;
          color: var(--color-text-primary);
          background: transparent !important;
        }
        
        /* Prism.js syntax highlighting - theme-aware colors */
        .code-block-wrapper .token.property {
          color: var(--color-accent);
          opacity: 0.9;
        }
        
        .code-block-wrapper .token.string {
          color: var(--color-success, #10b981);
        }
        
        .code-block-wrapper .token.number,
        .code-block-wrapper .token.boolean {
          color: var(--color-info, #3b82f6);
        }
        
        .code-block-wrapper .token.punctuation {
          color: var(--color-text-secondary);
          opacity: 0.7;
        }
        
        .code-block-wrapper .token.operator {
          color: var(--color-text-primary);
          opacity: 0.8;
        }
        
        .code-block-wrapper .token.null,
        .code-block-wrapper .token.keyword {
          color: var(--color-warning, #f59e0b);
        }
        
        .code-block-wrapper .token.comment {
          color: var(--color-text-tertiary);
          font-style: italic;
        }
        
        .code-block-wrapper .token.function {
          color: var(--color-accent);
        }
      `}</style>
    </div>
  );
}
