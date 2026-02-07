/**
 * CodeBlock Component - Enhanced with Radix UI
 * Syntax highlighting with Prism.js and Radix styling
 */

import { useEffect, useRef } from 'preact/hooks';
import { Box, Flex, Text, IconButton, Code } from '@radix-ui/themes';
import { CopyIcon, CheckIcon } from '@radix-ui/react-icons';
import { useState } from 'preact/hooks';
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
  showCopyButton?: boolean;
}

/**
 * Shared theme-aware code block component with syntax highlighting
 * Used in webhook messages and documentation
 */
export function CodeBlock({ 
  code, 
  language, 
  maxHeight = '300px', 
  showLanguageLabel = false,
  showCopyButton = true
}: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <Box position="relative" style={{ border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-3)', overflow: 'hidden' }}>
      <Flex justify="between" align="center" p="2" style={{ borderBottom: '1px solid var(--gray-6)' }}>
        {showLanguageLabel && (
          <Text size="1" color="gray" weight="medium" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {language}
          </Text>
        )}
        <div style={{ flex: 1 }} />
        {showCopyButton && (
          <IconButton
            variant="ghost"
            size="1"
            color={copied ? 'green' : 'gray'}
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy code'}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
        )}
      </Flex>
      <pre 
        class="code-block-pre" 
        style={{ maxHeight, margin: 0, padding: 'var(--space-3)', overflow: 'auto', background: 'var(--gray-2)' }}
      >
        <code 
          ref={codeRef} 
          class={`language-${language}`}
          style={{ 
            fontFamily: 'var(--code-font-family)', 
            fontSize: '11px', 
            lineHeight: '1.5',
            color: 'var(--gray-12)'
          }}
        >
          {code.trim()}
        </code>
      </pre>
      <style>{`
        /* Prism.js syntax highlighting with Radix theme tokens */
        .code-block-pre .token.property,
        .code-block-pre .token.tag,
        .code-block-pre .token.selector {
          color: var(--blue-11);
        }
        
        .code-block-pre .token.string,
        .code-block-pre .token.attr-value {
          color: var(--green-11);
        }
        
        .code-block-pre .token.number,
        .code-block-pre .token.boolean {
          color: var(--violet-11);
        }
        
        .code-block-pre .token.punctuation {
          color: var(--gray-11);
        }
        
        .code-block-pre .token.comment {
          color: var(--gray-9);
          font-style: italic;
        }
        
        .code-block-pre .token.function,
        .code-block-pre .token.class-name {
          color: var(--amber-11);
        }
        
        .code-block-pre .token.keyword {
          color: var(--pink-11);
          font-weight: 500;
        }
      `}</style>
    </Box>
  );
}
