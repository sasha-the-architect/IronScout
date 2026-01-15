'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Check, Loader2, Calendar, Clock } from 'lucide-react';
import { updateNextRunAt } from '../actions';

interface EditNextRunTimeProps {
  feedId: string;
  currentNextRunAt: Date | null;
  isEnabled: boolean;
  scheduleFrequencyHours: number | null;
}

export function EditNextRunTime({
  feedId,
  currentNextRunAt,
  isEnabled,
  scheduleFrequencyHours,
}: EditNextRunTimeProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize with current value or a sensible default
  const getDefaultDateTime = useCallback(() => {
    if (currentNextRunAt) {
      return formatDateTimeLocal(currentNextRunAt);
    }
    // Default to next hour
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    return formatDateTimeLocal(now);
  }, [currentNextRunAt]);

  const [dateTimeValue, setDateTimeValue] = useState(getDefaultDateTime);

  // Format date for datetime-local input (YYYY-MM-DDTHH:MM)
  function formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Get min datetime (now + 1 minute)
  function getMinDateTime(): string {
    const min = new Date();
    min.setMinutes(min.getMinutes() + 1);
    return formatDateTimeLocal(min);
  }

  // Get max datetime (7 days from now)
  function getMaxDateTime(): string {
    const max = new Date();
    max.setDate(max.getDate() + 7);
    return formatDateTimeLocal(max);
  }

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const newDate = new Date(dateTimeValue);

      // Validate the date is valid
      if (isNaN(newDate.getTime())) {
        setError('Invalid date/time');
        return;
      }

      const result = await updateNextRunAt(feedId, newDate);

      if (result.success) {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(result.error || 'Failed to update');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDateTimeValue(getDefaultDateTime());
    setIsEditing(false);
    setError(null);
  };

  // Don't show edit button if feed is not enabled or has no schedule
  const canEdit = isEnabled && scheduleFrequencyHours !== null;

  // Display value
  const displayValue = currentNextRunAt
    ? new Date(currentNextRunAt).toLocaleString()
    : '—';

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-900">{displayValue}</span>
        {canEdit && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Edit next run time"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={dateTimeValue}
          onChange={(e) => setDateTimeValue(e.target.value)}
          min={getMinDateTime()}
          max={getMaxDateTime()}
          className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm border px-2 py-1"
          disabled={isSaving}
        />
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
          title="Save"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <p className="text-xs text-gray-500">
        Future runs will be scheduled every {scheduleFrequencyHours}h from this time.
      </p>
    </div>
  );
}
