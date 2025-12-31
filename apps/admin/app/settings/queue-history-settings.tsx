'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { updateQueueHistorySetting } from './actions';
import { SETTING_KEYS, QUEUE_DISPLAY_NAMES, NUMBER_SETTING_RANGES } from './constants';
import type { SettingValue } from './actions';

interface QueueHistorySettingsProps {
  initialSettings: {
    retentionCount: SettingValue;
    crawl: SettingValue;
    fetch: SettingValue;
    extract: SettingValue;
    normalize: SettingValue;
    write: SettingValue;
    alert: SettingValue;
    dealerFeedIngest: SettingValue;
    dealerSkuMatch: SettingValue;
    dealerBenchmark: SettingValue;
    dealerInsight: SettingValue;
    affiliateFeed: SettingValue;
    affiliateScheduler: SettingValue;
  };
}

// Queue setting key to display name mapping
const QUEUE_SETTINGS = [
  { key: SETTING_KEYS.QUEUE_HISTORY_CRAWL, prop: 'crawl' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_FETCH, prop: 'fetch' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_EXTRACT, prop: 'extract' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_NORMALIZE, prop: 'normalize' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_WRITE, prop: 'write' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_ALERT, prop: 'alert' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_DEALER_FEED_INGEST, prop: 'dealerFeedIngest' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_DEALER_SKU_MATCH, prop: 'dealerSkuMatch' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_DEALER_BENCHMARK, prop: 'dealerBenchmark' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_DEALER_INSIGHT, prop: 'dealerInsight' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_FEED, prop: 'affiliateFeed' as const },
  { key: SETTING_KEYS.QUEUE_HISTORY_AFFILIATE_SCHEDULER, prop: 'affiliateScheduler' as const },
];

export function QueueHistorySettings({ initialSettings }: QueueHistorySettingsProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retentionInput, setRetentionInput] = useState(String(initialSettings.retentionCount.value));

  const handleToggle = async (key: string, prop: keyof typeof initialSettings, currentValue: boolean) => {
    setLoadingKey(key);
    setError(null);

    const result = await updateQueueHistorySetting(key as any, !currentValue);

    if (result.success) {
      setSettings((prev) => ({
        ...prev,
        [prop]: { ...prev[prop], value: !currentValue },
      }));
    } else {
      setError(result.error || 'Failed to update');
    }

    setLoadingKey(null);
  };

  const handleRetentionChange = async () => {
    const value = parseInt(retentionInput, 10);
    const range = NUMBER_SETTING_RANGES[SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT];

    if (isNaN(value) || value < range.min || value > range.max) {
      setError(`Retention count must be between ${range.min} and ${range.max}`);
      return;
    }

    setLoadingKey(SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT);
    setError(null);

    const result = await updateQueueHistorySetting(
      SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT as any,
      value
    );

    if (result.success) {
      setSettings((prev) => ({
        ...prev,
        retentionCount: { ...prev.retentionCount, value },
      }));
    } else {
      setError(result.error || 'Failed to update');
    }

    setLoadingKey(null);
  };

  const enabledCount = QUEUE_SETTINGS.filter(
    (q) => settings[q.prop].value as boolean
  ).length;

  return (
    <div className="space-y-6">
      {/* Retention Count */}
      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <h3 className="font-medium text-gray-900">Retention Count</h3>
          <p className="text-sm text-gray-600">
            Number of completed jobs to keep per queue (10-1000)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={retentionInput}
            onChange={(e) => setRetentionInput(e.target.value)}
            min={10}
            max={1000}
            className="w-24 px-3 py-2 border border-gray-300 rounded-md text-right"
          />
          <button
            onClick={handleRetentionChange}
            disabled={loadingKey === SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT}
            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingKey === SETTING_KEYS.QUEUE_HISTORY_RETENTION_COUNT ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>

      {/* Queue Toggles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {QUEUE_SETTINGS.map(({ key, prop }) => {
          const isEnabled = settings[prop].value as boolean;
          const isLoading = loadingKey === key;
          const displayName = QUEUE_DISPLAY_NAMES[key];

          return (
            <button
              key={key}
              onClick={() => handleToggle(key, prop, isEnabled)}
              disabled={isLoading}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                isEnabled
                  ? 'bg-green-50 border-green-200 hover:bg-green-100'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <span className="text-sm font-medium text-gray-900">{displayName}</span>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              ) : isEnabled ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <X className="h-4 w-4 text-gray-400" />
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Status */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-sm text-blue-800">
          <strong>{enabledCount}</strong> of {QUEUE_SETTINGS.length} queues retain job history.
          Changes require harvester restart to take effect.
        </p>
      </div>
    </div>
  );
}
