'use client';

import { useState } from 'react';
import { Shield, ShieldAlert, ShieldOff, Loader2, Power, PowerOff } from 'lucide-react';
import { updateDangerZoneSetting } from './actions';
import { SETTING_KEYS, SETTING_DESCRIPTIONS } from './constants';
import type { SettingValue } from './actions';

interface DangerZoneSettingsProps {
  initialSettings: {
    allowPlainFtp: SettingValue;
    harvesterSchedulerEnabled: SettingValue;
    affiliateSchedulerEnabled: SettingValue;
  };
}

interface DangerSetting {
  key: typeof SETTING_KEYS[keyof typeof SETTING_KEYS];
  label: string;
  description: string;
  enableLabel: string;
  disableLabel: string;
  enableWarning: string[];
  disableWarning: string;
  invertLogic?: boolean; // For settings where "enabled" is the safe state
}

const DANGER_SETTINGS: DangerSetting[] = [
  {
    key: SETTING_KEYS.ALLOW_PLAIN_FTP,
    label: 'Allow Plain FTP for Affiliate Feeds',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.ALLOW_PLAIN_FTP],
    enableLabel: 'Enable (Insecure)',
    disableLabel: 'Disable (Secure)',
    enableWarning: [
      'Credentials will be transmitted in cleartext',
      'Network attackers can intercept passwords',
      'This violates security best practices',
    ],
    disableWarning: 'Existing feeds using plain FTP will fail until reconfigured to SFTP.',
  },
  {
    key: SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED,
    label: 'Main Harvester Scheduler',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED],
    enableLabel: 'Enable',
    disableLabel: 'Disable',
    enableWarning: [
      'The scheduler will start processing queued jobs',
      'This may increase server load',
    ],
    disableWarning: 'All scheduled harvesting will stop. Manual runs will still work.',
    invertLogic: true,
  },
  {
    key: SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED,
    label: 'Affiliate Feed Scheduler',
    description: SETTING_DESCRIPTIONS[SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED],
    enableLabel: 'Enable',
    disableLabel: 'Disable',
    enableWarning: [
      'Scheduled affiliate feed processing will resume',
      'Feeds will be fetched according to their schedule',
    ],
    disableWarning: 'Scheduled affiliate feed processing will stop. Manual runs will still work.',
    invertLogic: true,
  },
];

export function DangerZoneSettings({ initialSettings }: DangerZoneSettingsProps) {
  const [settings, setSettings] = useState<Record<string, boolean>>({
    [SETTING_KEYS.ALLOW_PLAIN_FTP]: initialSettings.allowPlainFtp.value as boolean,
    [SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED]: initialSettings.harvesterSchedulerEnabled.value as boolean,
    [SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED]: initialSettings.affiliateSchedulerEnabled.value as boolean,
  });

  const [metadata, setMetadata] = useState<Record<string, { updatedBy: string | null; updatedAt: Date | null }>>({
    [SETTING_KEYS.ALLOW_PLAIN_FTP]: {
      updatedBy: initialSettings.allowPlainFtp.updatedBy,
      updatedAt: initialSettings.allowPlainFtp.updatedAt,
    },
    [SETTING_KEYS.HARVESTER_SCHEDULER_ENABLED]: {
      updatedBy: initialSettings.harvesterSchedulerEnabled.updatedBy,
      updatedAt: initialSettings.harvesterSchedulerEnabled.updatedAt,
    },
    [SETTING_KEYS.AFFILIATE_SCHEDULER_ENABLED]: {
      updatedBy: initialSettings.affiliateSchedulerEnabled.updatedBy,
      updatedAt: initialSettings.affiliateSchedulerEnabled.updatedAt,
    },
  });

  const [showConfirmation, setShowConfirmation] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleClick = (key: string, newValue: boolean) => {
    setShowConfirmation(key);
    setPendingValue(newValue);
    setConfirmationInput('');
    setError(null);
  };

  const handleConfirm = async () => {
    if (!showConfirmation || pendingValue === null) return;

    setLoading(true);
    setError(null);

    const result = await updateDangerZoneSetting(
      showConfirmation as any,
      pendingValue,
      confirmationInput
    );

    setLoading(false);

    if (result.success) {
      setSettings((prev) => ({ ...prev, [showConfirmation]: pendingValue }));
      setMetadata((prev) => ({
        ...prev,
        [showConfirmation]: { updatedBy: 'you', updatedAt: new Date() },
      }));
      setShowConfirmation(null);
      setPendingValue(null);
      setConfirmationInput('');
    } else {
      setError(result.error || 'Failed to update setting');
    }
  };

  const handleCancel = () => {
    setShowConfirmation(null);
    setPendingValue(null);
    setConfirmationInput('');
    setError(null);
  };

  const activeSetting = DANGER_SETTINGS.find((s) => s.key === showConfirmation);
  const expectedCode = pendingValue ? 'ENABLE' : 'DISABLE';

  return (
    <div className="space-y-6">
      {/* Settings List */}
      {DANGER_SETTINGS.map((setting) => {
        const isEnabled = settings[setting.key];
        const meta = metadata[setting.key];
        const isSafeState = setting.invertLogic ? isEnabled : !isEnabled;

        return (
          <div
            key={setting.key}
            className={`flex items-start justify-between gap-4 p-4 border rounded-lg ${
              isSafeState ? 'bg-gray-50' : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {isSafeState ? (
                setting.invertLogic ? (
                  <Power className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                )
              ) : setting.invertLogic ? (
                <PowerOff className="h-5 w-5 text-red-500 mt-0.5" />
              ) : (
                <ShieldOff className="h-5 w-5 text-red-500 mt-0.5" />
              )}
              <div>
                <h3 className="font-medium text-gray-900">{setting.label}</h3>
                <p className="text-sm text-gray-600 mt-1">{setting.description}</p>
                {meta.updatedBy && (
                  <p className="text-xs text-gray-500 mt-2">
                    Last changed by {meta.updatedBy}
                    {meta.updatedAt && ` on ${new Date(meta.updatedAt).toLocaleString()}`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex-shrink-0">
              {isEnabled ? (
                <button
                  onClick={() => handleToggleClick(setting.key, false)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    setting.invertLogic
                      ? 'text-red-700 bg-red-100 hover:bg-red-200'
                      : 'text-green-700 bg-green-100 hover:bg-green-200'
                  }`}
                >
                  {setting.disableLabel}
                </button>
              ) : (
                <button
                  onClick={() => handleToggleClick(setting.key, true)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    setting.invertLogic
                      ? 'text-green-700 bg-green-100 hover:bg-green-200'
                      : 'text-red-700 bg-red-100 hover:bg-red-200'
                  }`}
                >
                  {setting.enableLabel}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Double Confirmation Modal */}
      {showConfirmation && activeSetting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <ShieldAlert className="h-8 w-8 text-red-500" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Confirm {pendingValue ? 'Enable' : 'Disable'} {activeSetting.label}
                </h3>
              </div>

              {pendingValue ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-red-800 font-medium mb-2">Warning:</p>
                  <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                    {activeSetting.enableWarning.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-amber-800">{activeSetting.disableWarning}</p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type <span className="font-mono bg-gray-100 px-1 rounded">{expectedCode}</span> to
                  confirm:
                </label>
                <input
                  type="text"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value.toUpperCase())}
                  placeholder={expectedCode}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading || confirmationInput !== expectedCode}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-2 ${
                    pendingValue
                      ? activeSetting.invertLogic
                        ? 'text-white bg-green-600 hover:bg-green-700'
                        : 'text-white bg-red-600 hover:bg-red-700'
                      : activeSetting.invertLogic
                      ? 'text-white bg-red-600 hover:bg-red-700'
                      : 'text-white bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pendingValue ? 'Enable' : 'Disable'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Summary */}
      <div
        className={`p-3 rounded-md ${
          Object.values(settings).some((v, i) =>
            DANGER_SETTINGS[i].invertLogic ? !v : v
          )
            ? 'bg-red-50 border border-red-200'
            : 'bg-green-50 border border-green-200'
        }`}
      >
        <p
          className={`text-sm font-medium ${
            Object.values(settings).some((v, i) =>
              DANGER_SETTINGS[i].invertLogic ? !v : v
            )
              ? 'text-red-800'
              : 'text-green-800'
          }`}
        >
          Status:{' '}
          {Object.values(settings).some((v, i) =>
            DANGER_SETTINGS[i].invertLogic ? !v : v
          )
            ? 'Some settings are in a non-default state'
            : 'All settings are in their safe default state'}
        </p>
      </div>
    </div>
  );
}
