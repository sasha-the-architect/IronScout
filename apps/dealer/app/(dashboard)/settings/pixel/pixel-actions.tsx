'use client';

import { useState } from 'react';
import { Copy, RefreshCw, Check } from 'lucide-react';
import { logger } from '@/lib/logger';

interface PixelActionsProps {
  dealerId: string;
  apiKey: string | null;
  pixelEnabled: boolean;
}

export function PixelActions({ dealerId, apiKey, pixelEnabled }: PixelActionsProps) {
  const [currentApiKey, setCurrentApiKey] = useState(apiKey);
  const [isEnabled, setIsEnabled] = useState(pixelEnabled);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const generateApiKey = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/pixel/generate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealerId }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentApiKey(data.apiKey);
        setIsEnabled(true);
      }
    } catch (error) {
      logger.error('Failed to generate API key', {}, error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!currentApiKey) return;
    
    try {
      await navigator.clipboard.writeText(currentApiKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      logger.error('Failed to copy', {}, error instanceof Error ? error : new Error(String(error)));
    }
  };

  const togglePixel = async () => {
    setIsToggling(true);
    try {
      const response = await fetch('/api/pixel/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealerId, enabled: !isEnabled }),
      });
      
      if (response.ok) {
        setIsEnabled(!isEnabled);
      }
    } catch (error) {
      logger.error('Failed to toggle pixel', {}, error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="space-y-4">
      {currentApiKey ? (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-100 px-3 py-2 rounded font-mono text-sm">
              {currentApiKey}
            </code>
            <button
              onClick={copyToClipboard}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Copy to clipboard"
            >
              {isCopied ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={generateApiKey}
              disabled={isGenerating}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
              title="Regenerate API key"
            >
              <RefreshCw className={`h-5 w-5 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Pixel tracking enabled</span>
            <button
              onClick={togglePixel}
              disabled={isToggling}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isEnabled ? 'bg-orange-600' : 'bg-gray-200'
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-600 mb-4">
            Generate an API key to start tracking revenue from IronScout.
          </p>
          <button
            onClick={generateApiKey}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Generate API Key
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
