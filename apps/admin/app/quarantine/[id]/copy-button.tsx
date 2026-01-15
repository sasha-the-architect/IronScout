'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center justify-center p-1 rounded hover:bg-gray-100
        transition-colors text-gray-400 hover:text-gray-600 ${className}`}
      title={label ? `Copy ${label}` : 'Copy to clipboard'}
      aria-label={label ? `Copy ${label}` : 'Copy to clipboard'}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/**
 * Inline copy button with value display
 */
interface CopyableValueProps {
  value: string;
  label?: string;
  truncate?: boolean;
  mono?: boolean;
  className?: string;
}

export function CopyableValue({
  value,
  label,
  truncate = false,
  mono = true,
  className = '',
}: CopyableValueProps) {
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''} ${
          truncate ? 'truncate max-w-[200px]' : ''
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
      <CopyButton value={value} label={label} />
    </div>
  );
}
