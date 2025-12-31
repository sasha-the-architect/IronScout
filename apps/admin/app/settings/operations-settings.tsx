'use client';

import { useState } from 'react';
import { Settings, Loader2, Save } from 'lucide-react';
import { updateOperationsSetting } from './actions';
import { SETTING_KEYS, SETTING_DESCRIPTIONS, NUMBER_SETTING_RANGES } from './constants';
import type { SettingValue } from './actions';

interface OperationsSettingsProps {
  initialSettings: {
    affiliateBatchSize: SettingValue;
    priceHeartbeatHours: SettingValue;
    affiliateRunRetentionDays: SettingValue;
  };
}

interface SettingConfig {
  key: typeof SETTING_KEYS[keyof typeof SETTING_KEYS];
  label: string;
  description: string;
  unit: string;
}

const SETTINGS: SettingConfig[] = [
  {
    key: SETTING_KEYS.AFFILIATE_BATCH_SIZE,
    label: 'Affiliate Batch Size',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.AFFILIATE_BATCH_SIZE],
    unit: 'items',
  },
  {
    key: SETTING_KEYS.PRICE_HEARTBEAT_HOURS,
    label: 'Price Heartbeat Interval',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.PRICE_HEARTBEAT_HOURS],
    unit: 'hours',
  },
  {
    key: SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS,
    label: 'Run History Retention',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS],
    unit: 'days',
  },
];

export function OperationsSettings({ initialSettings }: OperationsSettingsProps) {
  const [values, setValues] = useState<Record<string, number>>({
    [SETTING_KEYS.AFFILIATE_BATCH_SIZE]: initialSettings.affiliateBatchSize.value as number,
    [SETTING_KEYS.PRICE_HEARTBEAT_HOURS]: initialSettings.priceHeartbeatHours.value as number,
    [SETTING_KEYS.AFFILIATE_RUN_RETENTION_DAYS]: initialSettings.affiliateRunRetentionDays.value as number,
  });

  const [originalValues] = useState<Record<string, number>>({ ...values });
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hasChanges = (key: string) => values[key] !== originalValues[key];

  const handleChange = (key: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      setValues((prev) => ({ ...prev, [key]: numValue }));
    }
  };

  const handleSave = async (key: typeof SETTING_KEYS[keyof typeof SETTING_KEYS]) => {
    setLoading(key);
    setError(null);
    setSuccess(null);

    const result = await updateOperationsSetting(key, values[key]);

    setLoading(null);

    if (result.success) {
      setSuccess(`${key} updated successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error || 'Failed to update setting');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          {success}
        </div>
      )}

      {SETTINGS.map((setting) => {
        const range = NUMBER_SETTING_RANGES[setting.key];
        const isModified = hasChanges(setting.key);

        return (
          <div
            key={setting.key}
            className={`p-4 border rounded-lg transition-colors ${
              isModified ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Settings className="h-5 w-5 mt-0.5 text-gray-400" />
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{setting.label}</h3>
                  <p className="text-sm text-gray-600 mt-0.5">{setting.description}</p>
                  {range && (
                    <p className="text-xs text-gray-500 mt-1">
                      Range: {range.min} - {range.max} {setting.unit}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={values[setting.key]}
                    onChange={(e) => handleChange(setting.key, e.target.value)}
                    min={range?.min}
                    max={range?.max}
                    className="w-24 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-500">{setting.unit}</span>
                </div>

                {isModified && (
                  <button
                    onClick={() => handleSave(setting.key)}
                    disabled={loading === setting.key}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {loading === setting.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
