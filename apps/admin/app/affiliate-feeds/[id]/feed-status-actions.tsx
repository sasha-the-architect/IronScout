'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import {
  enableFeed,
  pauseFeed,
  reenableFeed,
  triggerManualRun,
} from '../actions';
import type { AffiliateFeed } from '@ironscout/db/generated/prisma';

interface FeedStatusActionsProps {
  feed: AffiliateFeed;
}

export function FeedStatusActions({ feed }: FeedStatusActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (
    action: () => Promise<{ success: boolean; error?: string; message?: string }>
  ) => {
    setIsLoading(true);
    try {
      const result = await action();
      if (!result.success) {
        alert(result.error || 'Action failed');
      } else if (result.message) {
        alert(result.message);
      }
      router.refresh();
    } catch {
      alert('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {feed.status === 'DRAFT' && (
        <button
          onClick={() => handleAction(() => enableFeed(feed.id))}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Enable
        </button>
      )}

      {feed.status === 'ENABLED' && (
        <>
          <button
            onClick={() => handleAction(() => pauseFeed(feed.id))}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
          >
            <Pause className="h-4 w-4" />
            Pause
          </button>
          {!feed.manualRunPending && (
            <button
              onClick={() => handleAction(() => triggerManualRun(feed.id))}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Run Now
            </button>
          )}
        </>
      )}

      {(feed.status === 'PAUSED' || feed.status === 'DISABLED') && (
        <button
          onClick={() => handleAction(() => reenableFeed(feed.id))}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Re-enable
        </button>
      )}

      {feed.manualRunPending && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Run Pending
        </span>
      )}
    </div>
  );
}
