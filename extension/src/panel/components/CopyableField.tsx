/**
 * CopyableField Component - Radix UI Migration
 * Uses Radix TextField and IconButton
 */

import { useState } from 'preact/hooks';
import { TextField, IconButton, Flex, Text, Code } from '@radix-ui/themes';
import { CopyIcon, CheckIcon } from '@radix-ui/react-icons';

interface CopyableFieldProps {
  value: string;
  label?: string;
  helperText?: string;
  onCopy?: () => void;
  className?: string;
  variant?: 'field' | 'code';
}

export function CopyableField({ value, label, helperText, onCopy, className = '', variant = 'field' }: CopyableFieldProps) {
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
    <Flex direction="column" gap="2" className={className}>
      {label && (
        <Text size="2" weight="medium" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </Text>
      )}
      <Flex gap="2" align="center">
        {variant === 'code' ? (
          <Code size="2" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value}
          </Code>
        ) : (
          <TextField.Root
            value={value}
            readOnly
            size="2"
            style={{ flex: 1 }}
          />
        )}
        <IconButton
          variant="soft"
          color={copied ? 'green' : 'gray'}
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
      </Flex>
      {helperText && (
        <Text size="1" color="gray">{helperText}</Text>
      )}
    </Flex>
  );
}
