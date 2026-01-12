'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  XOctagon,
  Eraser,
} from 'lucide-react';
import {
  enableFeed,
  pauseFeed,
  reenableFeed,
  triggerManualRun,
  resetFeedState,
  forceReprocess,
} from '../actions';
import type { affiliate_feeds } from '@ironscout/db/generated/prisma';

interface FeedStatusActionsProps {
  feed: affiliate_feeds;
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
        toast.error(result.error || 'Action failed');
      } else if (result.message) {
        toast.success(result.message);
      }
      router.refresh();
    } catch {
      toast.error('An unexpected error occurred');
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

      {/* Force Reprocess button - clears content hash to force full reprocessing */}
      {feed.lastContentHash && (
        <button
          onClick={() => {
            if (confirm('Force reprocess? This clears the content hash so the next run will fully process the feed even if the file hasn\'t changed.')) {
              handleAction(() => forceReprocess(feed.id));
            }
          }}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          title="Clear content hash to force full reprocessing on next run"
        >
          <Eraser className="h-4 w-4" />
          Force Reprocess
        </button>
      )}

      {/* Reset button - shows when there's stuck state to clear */}
      {(feed.manualRunPending || feed.consecutiveFailures > 0) && (
        <button
          onClick={() => {
            if (confirm('Reset feed state? This will clear pending runs, failure counts, and cancel any stuck jobs.')) {
              handleAction(() => resetFeedState(feed.id));
            }
          }}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-md bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          title="Reset stuck state (clears pending runs, failure counts)"
        >
          <XOctagon className="h-4 w-4" />
          Reset
        </button>
      )}
    </div>
  );
}
