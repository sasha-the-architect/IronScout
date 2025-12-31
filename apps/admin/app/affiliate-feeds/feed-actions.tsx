'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MoreHorizontal,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Trash2,
} from 'lucide-react';
import {
  enableFeed,
  pauseFeed,
  reenableFeed,
  triggerManualRun,
  deleteAffiliateFeed,
} from './actions';

interface FeedActionsProps {
  feed: {
    id: string;
    status: 'DRAFT' | 'ENABLED' | 'PAUSED' | 'DISABLED';
    manualRunPending: boolean;
  };
}

export function FeedActions({ feed }: FeedActionsProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 192, // 192px = w-48
      });
    }
  }, [isOpen]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (action: () => Promise<{ success: boolean; error?: string }>) => {
    setIsLoading(true);
    try {
      const result = await action();
      if (!result.success) {
        alert(result.error || 'Action failed');
      }
      router.refresh();
    } catch {
      alert('An unexpected error occurred');
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this feed? This action cannot be undone.')) {
      return;
    }
    await handleAction(() => deleteAffiliateFeed(feed.id));
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
      >
        <MoreHorizontal className="h-5 w-5 text-gray-500" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 w-48 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <div className="py-1">
              <Link
                href={`/affiliate-feeds/${feed.id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setIsOpen(false)}
              >
                <Eye className="h-4 w-4" />
                View Details
              </Link>

              {feed.status === 'DRAFT' && (
                <button
                  onClick={() => handleAction(() => enableFeed(feed.id))}
                  disabled={isLoading}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  Enable Feed
                </button>
              )}

              {feed.status === 'ENABLED' && (
                <>
                  <button
                    onClick={() => handleAction(() => pauseFeed(feed.id))}
                    disabled={isLoading}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <Pause className="h-4 w-4" />
                    Pause Feed
                  </button>
                  {!feed.manualRunPending && (
                    <button
                      onClick={() => handleAction(() => triggerManualRun(feed.id))}
                      disabled={isLoading}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" />
                      Run Now
                    </button>
                  )}
                </>
              )}

              {(feed.status === 'PAUSED' || feed.status === 'DISABLED') && (
                <button
                  onClick={() => handleAction(() => reenableFeed(feed.id))}
                  disabled={isLoading}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Re-enable Feed
                </button>
              )}

              <hr className="my-1" />

              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete Feed
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
