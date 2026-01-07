'use client';

import { useState } from 'react';
import { Wifi, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { testFeedConnection } from './actions';

interface TestConnectionButtonProps {
  feedId: string;
}

/** Format file size in human-readable format */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function TestConnectionButton({ feedId }: TestConnectionButtonProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
    fileSize?: number;
    fileName?: string;
  } | null>(null);

  const handleTest = async () => {
    setIsTesting(true);
    setResult(null);

    try {
      const response = await testFeedConnection(feedId);
      setResult(response);
    } catch (err) {
      setResult({
        success: false,
        error: 'Failed to test connection',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-200">
      <button
        type="button"
        onClick={handleTest}
        disabled={isTesting}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isTesting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wifi className="h-4 w-4" />
        )}
        {isTesting ? 'Testing...' : 'Test Connection'}
      </button>

      {result && (
        <div className={`flex items-center gap-2 text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
          {result.success ? (
            <>
              <CheckCircle className="h-4 w-4" />
              <span>
                Connected! Found {result.fileName}
                {result.fileSize !== undefined && ` (${formatFileSize(result.fileSize)})`}
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4" />
              <span>{result.error}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
