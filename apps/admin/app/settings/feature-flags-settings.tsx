'use client';

import { useState } from 'react';
import { ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { updateFeatureFlagSetting } from './actions';
import { SETTING_KEYS, SETTING_DESCRIPTIONS } from './constants';
import type { SettingValue } from './actions';

interface FeatureFlagsSettingsProps {
  initialSettings: {
    maintenanceMode: SettingValue;
    registrationEnabled: SettingValue;
    aiSearchEnabled: SettingValue;
    vectorSearchEnabled: SettingValue;
    emailNotificationsEnabled: SettingValue;
    alertProcessingEnabled: SettingValue;
  };
}

interface FlagConfig {
  key: typeof SETTING_KEYS[keyof typeof SETTING_KEYS];
  label: string;
  description: string;
  defaultEnabled: boolean;
  invertDisplay?: boolean; // For flags where "enabled" means "feature is OFF"
}

const FLAGS: FlagConfig[] = [
  {
    key: SETTING_KEYS.MAINTENANCE_MODE,
    label: 'Maintenance Mode',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.MAINTENANCE_MODE],
    defaultEnabled: false,
    invertDisplay: true, // When enabled, site is in maintenance
  },
  {
    key: SETTING_KEYS.REGISTRATION_ENABLED,
    label: 'User Registration',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.REGISTRATION_ENABLED],
    defaultEnabled: true,
  },
  {
    key: SETTING_KEYS.AI_SEARCH_ENABLED,
    label: 'AI Search',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.AI_SEARCH_ENABLED],
    defaultEnabled: true,
  },
  {
    key: SETTING_KEYS.VECTOR_SEARCH_ENABLED,
    label: 'Vector Search',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.VECTOR_SEARCH_ENABLED],
    defaultEnabled: true,
  },
  {
    key: SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED,
    label: 'Email Notifications',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED],
    defaultEnabled: true,
  },
  {
    key: SETTING_KEYS.ALERT_PROCESSING_ENABLED,
    label: 'Alert Processing',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.ALERT_PROCESSING_ENABLED],
    defaultEnabled: true,
  },
];

export function FeatureFlagsSettings({ initialSettings }: FeatureFlagsSettingsProps) {
  const [settings, setSettings] = useState<Record<string, boolean>>({
    [SETTING_KEYS.MAINTENANCE_MODE]: initialSettings.maintenanceMode.value as boolean,
    [SETTING_KEYS.REGISTRATION_ENABLED]: initialSettings.registrationEnabled.value as boolean,
    [SETTING_KEYS.AI_SEARCH_ENABLED]: initialSettings.aiSearchEnabled.value as boolean,
    [SETTING_KEYS.VECTOR_SEARCH_ENABLED]: initialSettings.vectorSearchEnabled.value as boolean,
    [SETTING_KEYS.EMAIL_NOTIFICATIONS_ENABLED]: initialSettings.emailNotificationsEnabled.value as boolean,
    [SETTING_KEYS.ALERT_PROCESSING_ENABLED]: initialSettings.alertProcessingEnabled.value as boolean,
  });

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (key: typeof SETTING_KEYS[keyof typeof SETTING_KEYS]) => {
    const newValue = !settings[key];
    setLoading(key);
    setError(null);

    const result = await updateFeatureFlagSetting(key, newValue);

    setLoading(null);

    if (result.success) {
      setSettings((prev) => ({ ...prev, [key]: newValue }));
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

      {FLAGS.map((flag) => {
        const isEnabled = settings[flag.key];
        const isActive = flag.invertDisplay ? isEnabled : isEnabled;
        const statusColor = flag.invertDisplay
          ? (isEnabled ? 'text-amber-600' : 'text-green-600')
          : (isEnabled ? 'text-green-600' : 'text-gray-400');

        return (
          <div
            key={flag.key}
            className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-start gap-3">
              {isEnabled ? (
                <ToggleRight className={`h-5 w-5 mt-0.5 ${statusColor}`} />
              ) : (
                <ToggleLeft className="h-5 w-5 mt-0.5 text-gray-400" />
              )}
              <div>
                <h3 className="font-medium text-gray-900">{flag.label}</h3>
                <p className="text-sm text-gray-600 mt-0.5">{flag.description}</p>
              </div>
            </div>

            <button
              onClick={() => handleToggle(flag.key)}
              disabled={loading === flag.key}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                isEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              {loading === flag.key ? (
                <Loader2 className="absolute left-1/2 -translate-x-1/2 h-4 w-4 animate-spin text-white" />
              ) : (
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              )}
            </button>
          </div>
        );
      })}

      {/* Status summary */}
      <div className="mt-4 p-3 bg-gray-100 rounded-md">
        <p className="text-xs text-gray-600">
          <strong>Active flags:</strong>{' '}
          {Object.entries(settings)
            .filter(([_, v]) => v)
            .length}{' '}
          / {FLAGS.length}
        </p>
      </div>
    </div>
  );
}
